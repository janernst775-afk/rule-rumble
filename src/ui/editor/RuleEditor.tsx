import { useMemo, useRef, useState, type DragEvent, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { testRunRule, type TestRunResult } from '../../bots/testRun';
import { DEFAULT_NPC_TYPES } from '../../engine/npc';
import { DEFAULT_SETTINGS } from '../../engine/settings';
import type { GameState } from '../../engine/types';
import type { EffectKind, RuleAST, RuleDefinition, TriggerKind } from '../../lang/ast';
import { checkRuleText, validationDiagnostics, type Diagnostic } from '../../lang/diagnose';
import { explainRule } from '../../lang/explain';
import { printRule } from '../../lang/printer';
import { ruleStrength, type StrengthLevel } from '../../lang/strength';
import { validateRule } from '../../lang/validator';
import { useProfile } from '../../store/profileStore';
import { EFFECT_KINDS, TRIGGER_KINDS } from '../ruleText';
import { BlockRow, ConditionFields, EffectFields, TriggerFields } from './Blocks';
import {
  CONDITION_TEMPLATES,
  defaultCondition,
  defaultEffect,
  defaultTrigger,
  emptyRule,
  newRuleId,
  type ConditionTemplate,
} from './model';
import { HighlightedRule, TextEditor } from './TextEditor';

const MAX_EFFECTS = 3;
const DRAG_TYPE = 'application/x-rule-block';

type PaletteItem =
  | { type: 'trigger'; kind: TriggerKind }
  | { type: 'condition'; kind: ConditionTemplate }
  | { type: 'effect'; kind: EffectKind }
  | { type: 'meta'; kind: 'duration' | 'limit' };

type Zone = 'when' | 'and' | 'then' | 'else' | 'meta';

interface Props {
  initial: RuleDefinition | null;
  game: GameState | null;
  author: string;
  onClose: () => void;
  onSave: (def: RuleDefinition) => void;
  /** In a running game: save and bring the rule into play. */
  onPlay?: (def: RuleDefinition) => void;
}

/** Fake line numbers that encode the block path, so validator errors can be grouped. */
const BLOCK_LINES = {
  name: 1,
  trigger: 2,
  conditions: Array.from({ length: 10 }, (_, i) => 100 + i),
  effects: Array.from({ length: 10 }, (_, i) => 200 + i),
  elseEffects: Array.from({ length: 10 }, (_, i) => 300 + i),
  duration: 400,
  limit: 500,
};

function move<T>(list: T[], i: number, dir: -1 | 1): T[] {
  const j = i + dir;
  if (j < 0 || j >= list.length) return list;
  const next = [...list];
  [next[i], next[j]] = [next[j]!, next[i]!];
  return next;
}

/** Rule editor (SPEC 5.4, reference screen 6): blocks ⇄ text on one AST. */
export function RuleEditor({ initial, game, author, onClose, onSave, onPlay }: Props) {
  const { t } = useTranslation();
  const codeLang = useProfile((s) => s.codeLang);
  const settings = game?.settings ?? DEFAULT_SETTINGS;
  const npcTypes = game?.npcTypes ?? DEFAULT_NPC_TYPES;
  const [ast, setAst] = useState<RuleAST>(() =>
    initial ? structuredClone(initial.ast) : emptyRule(t('editor.newRuleName')),
  );
  const [view, setView] = useState<'blocks' | 'text'>('blocks');
  const [text, setText] = useState('');
  const [switchError, setSwitchError] = useState(false);
  const [dragOver, setDragOver] = useState<Zone | null>(null);
  const [testResult, setTestResult] = useState<TestRunResult | null>(null);
  const [testSeed, setTestSeed] = useState(1);
  const textRef = useRef<HTMLTextAreaElement>(null);

  // Text view: the parsed text is the current rule while it is free of syntax errors.
  const textCheck = useMemo(
    () => (view === 'text' ? checkRuleText(text, settings, npcTypes) : null),
    [view, text, settings, npcTypes],
  );
  const current: RuleAST | null = view === 'blocks' ? ast : (textCheck?.rule?.ast ?? null);
  const diagnostics: Diagnostic[] = useMemo(() => {
    if (view === 'text') return textCheck?.diagnostics ?? [];
    return validationDiagnostics(ast, BLOCK_LINES, validateRule(ast, settings, npcTypes));
  }, [view, textCheck, ast, settings, npcTypes]);
  const valid = current !== null && diagnostics.length === 0;

  const message = (d: Diagnostic) => {
    let m = t(d.key, d.params);
    if (d.suggestion) m += ` ${t('editor.didYouMean', { word: d.suggestion })}`;
    return m;
  };
  const errorsAt = (line: number) => diagnostics.filter((d) => d.line === line).map(message);

  const toText = () => {
    setText(printRule(ast, codeLang));
    setView('text');
    setSwitchError(false);
  };
  const toBlocks = () => {
    const rule = textCheck?.rule;
    if (!rule) {
      setSwitchError(true);
      return;
    }
    setAst(rule.ast);
    setView('blocks');
    setSwitchError(false);
  };

  const definition = (): RuleDefinition | null => {
    if (!current || !valid) return null;
    const own = initial && !initial.id.startsWith('start.');
    return {
      id: own ? initial.id : newRuleId(),
      author: own ? initial.author : author,
      ast: current,
    };
  };

  // ---------- palette actions ----------
  const add = (item: PaletteItem, zone?: Zone) => {
    if (view !== 'blocks') return;
    setTestResult(null);
    setAst((a) => {
      switch (item.type) {
        case 'trigger':
          return { ...a, trigger: defaultTrigger(item.kind) };
        case 'condition':
          return { ...a, conditions: [...a.conditions, defaultCondition(item.kind, a.trigger)] };
        case 'effect': {
          const target = zone === 'else' ? 'elseEffects' : 'effects';
          if (a[target].length >= MAX_EFFECTS) return a;
          if (target === 'elseEffects' && a.conditions.length === 0) return a;
          return { ...a, [target]: [...a[target], defaultEffect(item.kind, a.trigger)] };
        }
        case 'meta':
          return item.kind === 'duration'
            ? { ...a, duration: a.duration ?? 5 }
            : { ...a, limit: a.limit ?? { count: 1, per: 'round' } };
      }
    });
  };

  const accepts = (zone: Zone, item: PaletteItem): boolean =>
    (zone === 'when' && item.type === 'trigger') ||
    (zone === 'and' && item.type === 'condition') ||
    ((zone === 'then' || zone === 'else') && item.type === 'effect') ||
    (zone === 'meta' && item.type === 'meta');

  const dropProps = (zone: Zone) => ({
    onDragOver: (e: DragEvent) => {
      if (!e.dataTransfer.types.includes(DRAG_TYPE)) return;
      e.preventDefault();
      setDragOver(zone);
    },
    onDragLeave: () => setDragOver((z) => (z === zone ? null : z)),
    onDrop: (e: DragEvent) => {
      e.preventDefault();
      setDragOver(null);
      try {
        const item = JSON.parse(e.dataTransfer.getData(DRAG_TYPE)) as PaletteItem;
        if (accepts(zone, item)) add(item, zone);
      } catch {
        // ignore foreign drops
      }
    },
  });

  const chip = (item: PaletteItem, label: string, tone: Zone) => (
    <button
      key={`${item.type}:${item.kind}`}
      type="button"
      className={`palette-chip chip-${tone}`}
      draggable={view === 'blocks'}
      disabled={view !== 'blocks'}
      onDragStart={(e) => {
        e.dataTransfer.setData(DRAG_TYPE, JSON.stringify(item));
        e.dataTransfer.effectAllowed = 'copy';
      }}
      onClick={() => add(item, item.type === 'effect' ? 'then' : undefined)}
      title={t('editor.paletteHint')}
    >
      {label}
    </button>
  );

  const dropZone = (zone: Zone, label: string, enabled = true): ReactNode =>
    enabled && (
      <div className={`drop-zone${dragOver === zone ? ' is-over' : ''}`} {...dropProps(zone)}>
        {label}
      </div>
    );

  const strength: StrengthLevel | null = current ? ruleStrength(current).level : null;
  const activeFrom = (game?.round ?? 1) + settings.rules.activationDelay;

  return (
    <div className="rule-editor" role="dialog" aria-modal="true" aria-labelledby="editor-title">
      <header className="editor-head">
        <button type="button" className="icon-btn" aria-label={t('common.back')} onClick={onClose}>
          ‹
        </button>
        <h1 id="editor-title" className="title-logo editor-title">
          {initial ? t('editor.editTitle') : t('editor.newTitle')}
        </h1>
        <input
          className="input editor-name"
          aria-label={t('editor.name')}
          value={view === 'blocks' ? ast.name : (current?.name ?? '')}
          disabled={view !== 'blocks'}
          maxLength={40}
          onChange={(e) => setAst((a) => ({ ...a, name: e.target.value }))}
        />
        <div className="segmented editor-toggle" role="group" aria-label={t('editor.view')}>
          <button
            type="button"
            aria-pressed={view === 'blocks'}
            onClick={view === 'text' ? toBlocks : undefined}
          >
            {t('editor.blocks')}
          </button>
          <button
            type="button"
            aria-pressed={view === 'text'}
            onClick={view === 'blocks' ? toText : undefined}
          >
            {t('editor.text')}
          </button>
        </div>
      </header>

      <div className="editor-body">
        <aside className="card editor-palette" aria-label={t('editor.palette')}>
          <h2>{t('editor.palette')}</h2>
          <h3 className="pal-when">{t('editor.zone.when')}</h3>
          <div className="palette-group">
            {TRIGGER_KINDS.map((k) =>
              chip({ type: 'trigger', kind: k }, t(`editor.trigger.${k}`), 'when'),
            )}
          </div>
          <h3 className="pal-and">{t('editor.zone.and')}</h3>
          <div className="palette-group">
            {CONDITION_TEMPLATES.map((k) =>
              chip({ type: 'condition', kind: k }, t(`editor.conditionTemplate.${k}`), 'and'),
            )}
          </div>
          <h3 className="pal-then">{t('editor.zone.then')}</h3>
          <div className="palette-group">
            {EFFECT_KINDS.map((k) =>
              chip({ type: 'effect', kind: k }, t(`editor.effect.${k}`), 'then'),
            )}
          </div>
          <h3 className="pal-meta">{t('editor.zone.meta')}</h3>
          <div className="palette-group">
            {chip({ type: 'meta', kind: 'duration' }, t('editor.duration'), 'meta')}
            {chip({ type: 'meta', kind: 'limit' }, t('editor.limit'), 'meta')}
          </div>
          <button type="button" className="btn btn-soft btn-small palette-workshop" disabled>
            {t('editor.workshopSoon')}
          </button>
        </aside>

        <section className="editor-canvas" aria-label={t('editor.canvas')}>
          {view === 'blocks' ? (
            <>
              <div {...dropProps('when')} className={dragOver === 'when' ? 'zone-over' : undefined}>
                <BlockRow
                  tone="when"
                  label={t('editor.zone.when')}
                  errors={errorsAt(BLOCK_LINES.trigger)}
                >
                  <TriggerFields
                    trigger={ast.trigger}
                    onChange={(trigger) => setAst((a) => ({ ...a, trigger }))}
                  />
                </BlockRow>
              </div>
              {ast.conditions.map((c, i) => (
                <BlockRow
                  key={`c${i}`}
                  tone="and"
                  label={t('editor.zone.and')}
                  errors={errorsAt(BLOCK_LINES.conditions[i] ?? 0)}
                  onRemove={() =>
                    setAst((a) => ({ ...a, conditions: a.conditions.filter((_, j) => j !== i) }))
                  }
                >
                  <ConditionFields
                    cond={c}
                    trigger={ast.trigger}
                    onOpenText={toText}
                    onChange={(e) =>
                      setAst((a) => ({
                        ...a,
                        conditions: a.conditions.map((x, j) => (j === i ? e : x)),
                      }))
                    }
                  />
                </BlockRow>
              ))}
              {dropZone('and', t('editor.dropCondition'))}
              {ast.effects.map((e, i) => (
                <BlockRow
                  key={`e${i}`}
                  tone="then"
                  label={t('editor.zone.then')}
                  errors={errorsAt(BLOCK_LINES.effects[i] ?? 0)}
                  onRemove={() =>
                    setAst((a) => ({ ...a, effects: a.effects.filter((_, j) => j !== i) }))
                  }
                  onUp={
                    i > 0
                      ? () => setAst((a) => ({ ...a, effects: move(a.effects, i, -1) }))
                      : undefined
                  }
                  onDown={
                    i < ast.effects.length - 1
                      ? () => setAst((a) => ({ ...a, effects: move(a.effects, i, 1) }))
                      : undefined
                  }
                >
                  <EffectFields
                    effect={e}
                    trigger={ast.trigger}
                    npcTypes={npcTypes}
                    onOpenText={toText}
                    onChange={(next) =>
                      setAst((a) => ({
                        ...a,
                        effects: a.effects.map((x, j) => (j === i ? next : x)),
                      }))
                    }
                  />
                </BlockRow>
              ))}
              {dropZone(
                'then',
                t('editor.dropEffect', { count: MAX_EFFECTS - ast.effects.length }),
                ast.effects.length < MAX_EFFECTS,
              )}
              {errorsAt(200).length === 0 && ast.effects.length === 0 && (
                <p className="hint">{t('editor.needEffect')}</p>
              )}
              {ast.conditions.length > 0 && (
                <>
                  {ast.elseEffects.map((e, i) => (
                    <BlockRow
                      key={`s${i}`}
                      tone="else"
                      label={t('editor.zone.else')}
                      errors={errorsAt(BLOCK_LINES.elseEffects[i] ?? 0)}
                      onRemove={() =>
                        setAst((a) => ({
                          ...a,
                          elseEffects: a.elseEffects.filter((_, j) => j !== i),
                        }))
                      }
                    >
                      <EffectFields
                        effect={e}
                        trigger={ast.trigger}
                        npcTypes={npcTypes}
                        onOpenText={toText}
                        onChange={(next) =>
                          setAst((a) => ({
                            ...a,
                            elseEffects: a.elseEffects.map((x, j) => (j === i ? next : x)),
                          }))
                        }
                      />
                    </BlockRow>
                  ))}
                  {dropZone(
                    'else',
                    t('editor.dropElse', { count: MAX_EFFECTS - ast.elseEffects.length }),
                    ast.elseEffects.length < MAX_EFFECTS,
                  )}
                </>
              )}
              {ast.duration !== null && (
                <BlockRow
                  tone="meta"
                  label={t('editor.duration')}
                  errors={errorsAt(BLOCK_LINES.duration)}
                  onRemove={() => setAst((a) => ({ ...a, duration: null }))}
                >
                  <input
                    type="number"
                    className="block-number-input"
                    aria-label={t('editor.duration')}
                    min={1}
                    max={50}
                    value={ast.duration}
                    onChange={(e) =>
                      setAst((a) => ({ ...a, duration: Math.round(Number(e.target.value)) || 1 }))
                    }
                  />
                  <span className="block-word">{t('editor.rounds')}</span>
                </BlockRow>
              )}
              {ast.limit !== null && (
                <BlockRow
                  tone="meta"
                  label={t('editor.limit')}
                  errors={errorsAt(BLOCK_LINES.limit)}
                  onRemove={() => setAst((a) => ({ ...a, limit: null }))}
                >
                  <input
                    type="number"
                    className="block-number-input"
                    aria-label={t('editor.limit')}
                    min={1}
                    max={10}
                    value={ast.limit.count}
                    onChange={(e) =>
                      setAst((a) => ({
                        ...a,
                        limit: {
                          count: Math.round(Number(e.target.value)) || 1,
                          per: a.limit?.per ?? 'round',
                        },
                      }))
                    }
                  />
                  <span className="block-word">{t('editor.timesPer')}</span>
                  <select
                    className="block-select"
                    aria-label={t('editor.limitPer')}
                    value={ast.limit.per}
                    onChange={(e) =>
                      setAst((a) => ({
                        ...a,
                        limit: {
                          count: a.limit?.count ?? 1,
                          per: e.target.value as 'round' | 'turn' | 'game',
                        },
                      }))
                    }
                  >
                    {(['round', 'turn', 'game'] as const).map((p) => (
                      <option key={p} value={p}>
                        {t(`editor.per.${p}`)}
                      </option>
                    ))}
                  </select>
                </BlockRow>
              )}
              {dropZone('meta', t('editor.dropMeta'), ast.duration === null || ast.limit === null)}
              {errorsAt(BLOCK_LINES.name).map((m) => (
                <p key={m} className="form-error">
                  {m}
                </p>
              ))}
            </>
          ) : (
            <TextEditor
              ref={textRef}
              value={text}
              onChange={(v) => {
                setText(v);
                setTestResult(null);
              }}
              diagnostics={diagnostics}
              message={message}
            />
          )}
          {switchError && (
            <p className="form-error" role="alert">
              {t('editor.fixFirst')}
            </p>
          )}
          <p className="fair-note editor-note">
            {activeFrom <= (game?.round ?? 1)
              ? t('rules.fairNow')
              : t('rules.fairNext', { round: activeFrom })}
          </p>
        </section>

        <aside className="editor-side">
          <div className="card code-preview" aria-label={t('editor.asText')}>
            <h3>{t('editor.asText')}</h3>
            {current ? (
              <HighlightedRule text={printRule(current, codeLang)} />
            ) : (
              <p className="hint">{t('editor.noPreview')}</p>
            )}
          </div>
          <div className="card explain-card">
            <h3>{t('editor.howItWorks')}</h3>
            <p>{current ? explainRule(current, (k, p) => t(k, p)) : t('editor.noPreview')}</p>
          </div>
          <div className="card strength-card">
            <h3>{t('editor.strength')}</h3>
            <div className="strength-pills">
              {(['harmless', 'exciting', 'heavy'] as const).map((s) => (
                <span key={s} className={`strength-pill${strength === s ? ' is-active' : ''}`}>
                  {t(`editor.strengthLevels.${s}`)}
                </span>
              ))}
            </div>
          </div>
          {testResult && (
            <div className="card test-result" role="status">
              <h3>{t('editor.testResult')}</h3>
              <p>{t('editor.testFired', { count: testResult.fired, rounds: testResult.rounds })}</p>
              {testResult.figures.length > 0 && (
                <ul>
                  {testResult.figures.slice(0, 5).map((f) => (
                    <li key={f.id}>
                      {t('editor.testFigure', {
                        name: f.name,
                        hits: f.hits,
                        damage: f.damage,
                        heal: f.heal,
                      })}
                    </li>
                  ))}
                </ul>
              )}
              {(testResult.tilesChanged > 0 || testResult.spawns > 0) && (
                <p className="hint">
                  {t('editor.testWorld', {
                    tiles: testResult.tilesChanged,
                    spawns: testResult.spawns,
                  })}
                </p>
              )}
            </div>
          )}
          <div className="editor-actions">
            <button
              type="button"
              className="btn"
              disabled={!valid}
              onClick={() => {
                const def = definition();
                if (!def) return;
                setTestResult(testRunRule(game, def, testSeed));
                setTestSeed((s) => s + 1);
              }}
            >
              {t('editor.testRun')}
            </button>
            <button
              type="button"
              className={`btn ${onPlay ? '' : 'btn-primary'}`}
              disabled={!valid}
              onClick={() => {
                const def = definition();
                if (def) onSave(def);
              }}
            >
              {t('editor.save')}
            </button>
            {onPlay && (
              <button
                type="button"
                className="btn btn-primary"
                disabled={!valid}
                onClick={() => {
                  const def = definition();
                  if (def) onPlay(def);
                }}
              >
                {t('rules.confirm')}
              </button>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
