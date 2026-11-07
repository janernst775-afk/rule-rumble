import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { debugEffect, type DebugRun } from '../../bots/debugRun';
import { testRunRule, type TestRunResult } from '../../bots/testRun';
import { DEFAULT_SETTINGS } from '../../engine/settings';
import type { NpcType } from '../../engine/types';
import type {
  EffectDef,
  Expr,
  FunctionDef,
  ParamType,
  ProgramAST,
  RuleDefinition,
  ValueType,
} from '../../lang/ast';
import { resolveBundle } from '../../lang/bundle';
import { parseEffectText } from '../../lang/parser';
import { printEffectDef } from '../../lang/printer';
import { npcTypeFor, validateEffect } from '../../lang/validator';
import { useLibrary } from '../../store/libraryStore';
import { useProfile } from '../../store/profileStore';
import { allNpcTypes, useWorkshop, withBundleFromWorkshop } from '../../store/workshopStore';
import { CodePanel } from '../code/CodePanel';
import { DebugPanel } from '../code/DebugPanel';
import { parseProblems, validationProblems } from '../code/problems';
import { useCompletionWords } from '../code/useCompletionWords';
import { Avatar } from '../components/Avatar';
import { Segmented } from '../components/Controls';
import { CloseIcon } from '../components/Icons';
import { newRuleId } from '../editor/model';
import { StmtList } from './EffectBlocks';
import { FunctionEditor } from './FunctionEditor';
import { NpcEditor } from './NpcEditor';
import { ProgramEditor } from './ProgramEditor';

const PARAM_TYPES: ParamType[] = [
  'number',
  'figure',
  'tile',
  'figureSet',
  'tileSet',
  'text',
  'npcType',
  'texture',
  'sound',
];

/** Stable empty list (workshops saved before v0.6 have no functions). */
const NO_FUNCTIONS: FunctionDef[] = [];

type Selection =
  | { kind: 'effect'; name: string | null }
  | { kind: 'npc'; id: string | null }
  | { kind: 'function'; name: string | null }
  | { kind: 'program' };

function emptyEffect(author: string, name: string): EffectDef {
  return { name, author, symbol: '✦', params: [], body: [] };
}

/** Maps a validator path to the statement path that owns it ("body.1.then.0"). */
function stmtPath(path: string): string {
  const m = path.match(/^body(?:\.\d+(?:\.(?:then|else|body)\.\d+)*)?/);
  return m ? m[0] : path;
}

/** Arguments for a test call: defaults per parameter type, taken from the event. */
function testArgs(def: EffectDef): Expr[] {
  return def.params.map((p) => {
    switch (p.type) {
      case 'number':
        return { kind: 'num', value: 1 };
      case 'figure':
        return { kind: 'figureRef', ref: 'trigger' };
      case 'figureSet':
        return { kind: 'targets', target: { kind: 'all' } };
      case 'tile':
        return { kind: 'tileRef', tile: { kind: 'eventTile' } };
      case 'tileSet':
        return { kind: 'tiles', target: { kind: 'neighborTiles' } };
      case 'npcType':
        return { kind: 'str', value: 'zombie' };
      default:
        return { kind: 'str', value: '' };
    }
  });
}

interface Props {
  onClose: () => void;
}

/** Effect workshop (SPEC 5.7, 5.8, reference screen 7): blocks ⇄ Profi-Code. */
export function EffectWorkshop({ onClose }: Props) {
  const { t, i18n } = useTranslation();
  const author = useProfile((s) => s.name) || t('lobby.roles.hero');
  const lang = useProfile((s) => s.codeLang);
  const effects = useWorkshop((s) => s.effects);
  const ownNpcs = useWorkshop((s) => s.npcTypes);
  const functions = useWorkshop((s) => s.functions ?? NO_FUNCTIONS);
  const saveEffect = useWorkshop((s) => s.saveEffect);
  const removeEffect = useWorkshop((s) => s.removeEffect);
  const saveNpc = useWorkshop((s) => s.saveNpcType);
  const removeNpc = useWorkshop((s) => s.removeNpcType);
  const saveFunction = useWorkshop((s) => s.saveFunction);
  const removeFunction = useWorkshop((s) => s.removeFunction);
  const saveRule = useLibrary((s) => s.save);
  const npcTypes = useMemo(() => allNpcTypes(ownNpcs), [ownNpcs]);

  const [selection, setSelection] = useState<Selection>(() =>
    effects[0] ? { kind: 'effect', name: effects[0].name } : { kind: 'effect', name: null },
  );
  const original =
    selection.kind === 'effect' && selection.name
      ? (effects.find((e) => e.name === selection.name) ?? null)
      : null;
  const [draft, setDraft] = useState<EffectDef>(
    () => original ?? emptyEffect(author, t('workshop.newEffectName')),
  );
  const [draftFor, setDraftFor] = useState<string | null>(original?.name ?? null);
  const [mode, setMode] = useState<'blocks' | 'code'>('blocks');
  const [codeText, setCodeText] = useState('');
  const [switchError, setSwitchError] = useState(false);
  const [test, setTest] = useState<TestRunResult | null>(null);
  const [debug, setDebug] = useState<{ run: DebugRun; index: number } | null>(null);
  const [saved, setSaved] = useState(false);

  // Switching the selected effect loads it into the draft.
  if (selection.kind === 'effect' && (selection.name ?? null) !== draftFor) {
    const next = original ?? emptyEffect(author, t('workshop.newEffectName'));
    setDraftFor(selection.name ?? null);
    setDraft(next);
    setCodeText(printEffectDef(next, lang));
    setTest(null);
    setDebug(null);
    setSwitchError(false);
  }

  // The draft replaces its saved version while checking (calls to itself resolve to the draft).
  const registry = useMemo(
    () => [
      ...effects.filter(
        (e) => e.name !== draftFor && e.name.toLowerCase() !== draft.name.toLowerCase(),
      ),
      draft,
    ],
    [effects, draftFor, draft],
  );
  const errors = useMemo(
    () => validateEffect(draft, DEFAULT_SETTINGS, npcTypes, registry, functions),
    [draft, npcTypes, registry, functions],
  );
  const codeParse = useMemo(
    () => (mode === 'code' ? parseEffectText(codeText) : null),
    [mode, codeText],
  );
  const words = useCompletionWords(registry, functions, npcTypes);
  const nameTaken = effects.some(
    (e) => e.name.toLowerCase() === draft.name.toLowerCase() && e.name !== draftFor,
  );
  const byPath = new Map<string, string[]>();
  const general: string[] = [];
  for (const e of errors) {
    const msg = t(`validation.${e.code}`, e.params);
    if (e.path.startsWith('body.')) {
      const key = stmtPath(e.path);
      byPath.set(key, [...(byPath.get(key) ?? []), msg]);
    } else general.push(msg);
  }
  if (nameTaken) general.push(t('workshop.nameTaken'));
  const codeBroken = mode === 'code' && !codeParse?.effect;
  const valid = errors.length === 0 && !nameTaken && !codeBroken;
  const scope = new Map<string, ValueType>(draft.params.map((p) => [p.name.toLowerCase(), p.type]));

  const resetRuns = () => {
    setTest(null);
    setDebug(null);
    setSaved(false);
  };

  const toCode = () => {
    const text = printEffectDef(draft, lang);
    // Re-parse so that every statement knows its line (debugger, error lines).
    const parsed = parseEffectText(text).effect;
    if (parsed) setDraft({ ...parsed, symbol: draft.symbol, author: draft.author });
    setCodeText(text);
    setMode('code');
    setSwitchError(false);
    setDebug(null);
  };
  const toBlocks = () => {
    if (!codeParse?.effect) {
      setSwitchError(true);
      return;
    }
    setMode('blocks');
    setSwitchError(false);
    setDebug(null);
  };
  const onCodeChange = (text: string) => {
    setCodeText(text);
    resetRuns();
    const parsed = parseEffectText(text).effect;
    if (parsed) setDraft({ ...parsed, symbol: draft.symbol, author: draft.author });
  };

  const codeProblems = useMemo(() => {
    if (mode !== 'code' || !codeParse) return [];
    if (!codeParse.effect) return parseProblems(codeParse.errors, t);
    const out = validationProblems(errors, t);
    if (nameTaken) out.push({ line: 1, message: t('workshop.nameTaken') });
    return out;
  }, [mode, codeParse, errors, nameTaken, t]);

  const runTest = () => {
    const rule: RuleDefinition = {
      id: 'workshop.test',
      author,
      ast: {
        name: t('workshop.testRuleName'),
        trigger: { kind: 'turnStart' },
        conditions: [],
        effects: [{ kind: 'call', effect: draft.name, args: testArgs(draft) }],
        elseEffects: [],
        duration: null,
        limit: null,
      },
    };
    const bundle = resolveBundle(rule.ast, registry, npcTypes, functions);
    setTest(testRunRule(null, { ...rule, bundle }, Date.now() % 1000));
  };

  const debugStep = (toEnd: boolean) => {
    const run =
      debug?.run ??
      debugEffect(draft, testArgs(draft), { effects: registry, functions, npcTypes }, 1);
    const last = run.steps.length - 1;
    const index = toEnd ? last : Math.min(last, (debug?.index ?? -1) + 1);
    setDebug({ run, index });
  };
  const activeLine = mode === 'code' && debug ? (debug.run.steps[debug.index]?.line ?? null) : null;

  /** Code file: effects, functions, NPC behaviors and rules go to their places. */
  const applyProgram = (p: ProgramAST) => {
    for (const def of p.functions) saveFunction({ ...def, author });
    for (const def of p.effects) {
      const old = effects.find((e) => e.name.toLowerCase() === def.name.toLowerCase());
      saveEffect({ ...def, author, symbol: old?.symbol || '✦' }, old?.name);
    }
    for (const code of p.npcCode) {
      const type = npcTypeFor(code, ownNpcs);
      if (type) saveNpc({ ...type, code: code.body });
    }
    // Rules join the library with everything they need.
    const state = useWorkshop.getState();
    for (const ast of p.rules) {
      saveRule(
        withBundleFromWorkshop(
          { id: newRuleId(), author, ast },
          state.effects,
          allNpcTypes(state.npcTypes),
          state.functions,
        ),
      );
    }
  };

  const codeMode = selection.kind === 'function' || selection.kind === 'program';
  const shownMode = codeMode ? 'code' : mode;

  return (
    <div
      className="rule-editor workshop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="workshop-title"
    >
      <header className="editor-head">
        <button type="button" className="icon-btn" aria-label={t('common.back')} onClick={onClose}>
          ‹
        </button>
        <h1 id="workshop-title" className="title-logo editor-title">
          {t('workshop.title')}
        </h1>
        {selection.kind !== 'npc' && (
          <div className="workshop-mode-switch">
            <Segmented<'blocks' | 'code'>
              label={t('workshop.mode')}
              value={shownMode}
              options={[
                { value: 'blocks', label: t('workshop.modeBlocks'), disabled: codeMode },
                { value: 'code', label: t('workshop.modeCode') },
              ]}
              onChange={(m) => {
                if (codeMode) return;
                if (m === 'code' && mode !== 'code') toCode();
                if (m === 'blocks' && mode !== 'blocks') toBlocks();
              }}
            />
          </div>
        )}
      </header>
      {switchError && (
        <p className="form-error workshop-switch-error" role="alert">
          {t('workshop.switchBlocked')}
        </p>
      )}
      <div className="editor-body">
        <aside className="card editor-palette workshop-list" aria-label={t('workshop.mine')}>
          <h2>{t('workshop.mine')}</h2>
          <h3>{t('workshop.effects')}</h3>
          <ul className="mine-list">
            {effects.map((e) => (
              <li key={e.name}>
                <button
                  type="button"
                  className="mine-item"
                  aria-pressed={selection.kind === 'effect' && selection.name === e.name}
                  onClick={() => setSelection({ kind: 'effect', name: e.name })}
                >
                  <span className="mine-symbol">{e.symbol}</span> {e.name}
                </button>
              </li>
            ))}
          </ul>
          <h3>{t('workshop.functions')}</h3>
          <ul className="mine-list">
            {functions.length === 0 && <li className="hint">{t('workshop.noFunctions')}</li>}
            {functions.map((f) => (
              <li key={f.name}>
                <button
                  type="button"
                  className="mine-item"
                  aria-pressed={selection.kind === 'function' && selection.name === f.name}
                  onClick={() => setSelection({ kind: 'function', name: f.name })}
                >
                  {f.name}()
                </button>
              </li>
            ))}
          </ul>
          <h3>{t('workshop.npcTypes')}</h3>
          <ul className="mine-list">
            {npcTypes.map((n) => (
              <li key={n.id}>
                <button
                  type="button"
                  className="mine-item"
                  aria-pressed={selection.kind === 'npc' && selection.id === n.id}
                  disabled={!ownNpcs.some((o) => o.id === n.id)}
                  title={ownNpcs.some((o) => o.id === n.id) ? undefined : t('workshop.builtIn')}
                  onClick={() => setSelection({ kind: 'npc', id: n.id })}
                >
                  <Avatar
                    name={n.symbol}
                    avatar={{ image: n.image ?? null, color: n.color }}
                    size={26}
                  />{' '}
                  {n.name}
                </button>
              </li>
            ))}
          </ul>
          <div className="mine-actions">
            <button
              type="button"
              className="btn btn-soft btn-small"
              onClick={() => setSelection({ kind: 'effect', name: null })}
            >
              {t('workshop.newEffect')}
            </button>
            <button
              type="button"
              className="btn btn-soft btn-small"
              onClick={() => setSelection({ kind: 'function', name: null })}
            >
              {t('workshop.newFunction')}
            </button>
            <button
              type="button"
              className="btn btn-soft btn-small"
              onClick={() => setSelection({ kind: 'npc', id: null })}
            >
              {t('workshop.newNpc')}
            </button>
            <button
              type="button"
              className="btn btn-soft btn-small"
              aria-pressed={selection.kind === 'program'}
              onClick={() => setSelection({ kind: 'program' })}
            >
              {t('workshop.openProgram')}
            </button>
          </div>
        </aside>

        {selection.kind === 'npc' && (
          <section className="editor-canvas workshop-canvas npc-canvas">
            <NpcEditor
              key={selection.id ?? 'new'}
              initial={ownNpcs.find((n) => n.id === selection.id) ?? null}
              takenIds={npcTypes.map((n) => n.id)}
              library={{ effects, functions, npcTypes }}
              words={words}
              onSave={(npc: NpcType, previousId) => {
                if (previousId && previousId !== npc.id) removeNpc(previousId);
                saveNpc(npc);
                setSelection({ kind: 'npc', id: npc.id });
              }}
              onDelete={
                selection.id
                  ? () => {
                      removeNpc(selection.id ?? '');
                      setSelection({ kind: 'effect', name: null });
                    }
                  : undefined
              }
            />
          </section>
        )}

        {selection.kind === 'function' && (
          <FunctionEditor
            key={selection.name ?? 'new'}
            initial={functions.find((f) => f.name === selection.name) ?? null}
            functions={functions}
            settings={DEFAULT_SETTINGS}
            words={words}
            lang={lang}
            author={author}
            onSave={(def, previousName) => {
              saveFunction(def, previousName ?? undefined);
              setSelection({ kind: 'function', name: def.name });
            }}
            onDelete={
              selection.name
                ? () => {
                    removeFunction(selection.name ?? '');
                    setSelection({ kind: 'effect', name: null });
                  }
                : undefined
            }
          />
        )}

        {selection.kind === 'program' && (
          <ProgramEditor
            effects={effects}
            functions={functions}
            npcTypes={npcTypes}
            ownNpcTypes={ownNpcs}
            settings={DEFAULT_SETTINGS}
            words={words}
            lang={lang}
            onApply={applyProgram}
          />
        )}

        {selection.kind === 'effect' && (
          <>
            {mode === 'code' ? (
              <CodePanel
                file={t('workshop.fileEffect', { name: draft.name.toLowerCase() })}
                value={codeText}
                onChange={onCodeChange}
                problems={codeProblems}
                words={words}
                lang={lang}
                activeLine={activeLine}
                footer={
                  debug ? (
                    <p className="hint">
                      {debug.run.aborted
                        ? t('workshop.testAborted', {
                            reason: t(`workshop.aborted.${debug.run.aborted}`),
                          })
                        : t('workshop.testSummary', {
                            used: debug.run.used.toLocaleString(i18n.language),
                            max: debug.run.budget.toLocaleString(i18n.language),
                            events: debug.run.events.length,
                          })}
                    </p>
                  ) : (
                    <p className="hint">{t('workshop.note')}</p>
                  )
                }
              />
            ) : (
              <section className="editor-canvas workshop-canvas" aria-label={t('workshop.body')}>
                <div className="block-row block-when effect-head">
                  <span className="block-label">{t('workshop.effectWord')}</span>
                  <div className="block-fields">
                    <input
                      className="block-text effect-symbol"
                      aria-label={t('workshop.symbol')}
                      value={draft.symbol}
                      maxLength={2}
                      onChange={(e) => setDraft({ ...draft, symbol: e.target.value })}
                    />
                    <input
                      className="block-text effect-name"
                      aria-label={t('workshop.name')}
                      value={draft.name}
                      maxLength={30}
                      onChange={(e) => {
                        setDraft({ ...draft, name: e.target.value.replace(/\s+/g, '_') });
                        setSaved(false);
                      }}
                    />
                    <span className="block-word">
                      (
                      {draft.params
                        .map((p) => `${p.name}: ${t(`workshop.types.${p.type}`)}`)
                        .join(', ')}
                      )
                    </span>
                  </div>
                </div>
                <StmtList
                  stmts={draft.body}
                  scope={scope}
                  ctx={{ npcTypes, effects: registry, self: draft.name, onOpenCode: toCode }}
                  errors={byPath}
                  path="body"
                  onChange={(body) => {
                    setDraft({ ...draft, body });
                    resetRuns();
                  }}
                />
                <p className="fair-note editor-note">{t('workshop.note')}</p>
              </section>
            )}
            <aside className="editor-side">
              <div className="card">
                <h3>{t('workshop.params')}</h3>
                {draft.params.map((p, i) => (
                  <div key={i} className="param-row">
                    <input
                      className="block-text"
                      aria-label={t('workshop.paramName')}
                      value={p.name}
                      maxLength={16}
                      disabled={mode === 'code'}
                      onChange={(e) => {
                        const params = [...draft.params];
                        params[i] = {
                          ...p,
                          name: e.target.value.toLowerCase().replace(/\s+/g, '_'),
                        };
                        setDraft({ ...draft, params });
                      }}
                    />
                    <select
                      className="block-select"
                      aria-label={t('workshop.paramType')}
                      value={p.type}
                      disabled={mode === 'code'}
                      onChange={(e) => {
                        const params = [...draft.params];
                        params[i] = { ...p, type: e.target.value as ParamType };
                        setDraft({ ...draft, params });
                      }}
                    >
                      {PARAM_TYPES.map((pt) => (
                        <option key={pt} value={pt}>
                          {t(`workshop.types.${pt}`)}
                        </option>
                      ))}
                    </select>
                    {mode === 'blocks' && (
                      <button
                        type="button"
                        className="mini-icon"
                        aria-label={t('editor.remove')}
                        onClick={() =>
                          setDraft({ ...draft, params: draft.params.filter((_, j) => j !== i) })
                        }
                      >
                        <CloseIcon size={14} />
                      </button>
                    )}
                  </div>
                ))}
                {mode === 'blocks' && (
                  <button
                    type="button"
                    className="mini-btn"
                    disabled={draft.params.length >= 4}
                    onClick={() =>
                      setDraft({
                        ...draft,
                        params: [
                          ...draft.params,
                          { name: `wert${draft.params.length + 1}`, type: 'number' },
                        ],
                      })
                    }
                  >
                    {t('workshop.addParam')}
                  </button>
                )}
              </div>
              {mode === 'code' ? (
                <DebugPanel
                  run={debug?.run ?? null}
                  index={debug?.index ?? -1}
                  disabled={!valid}
                  onStep={() => debugStep(false)}
                  onContinue={() => debugStep(true)}
                  onRestart={() => setDebug(null)}
                />
              ) : (
                <div className="card" role="status">
                  <h3>{t('workshop.check')}</h3>
                  {general.length === 0 && byPath.size === 0 ? (
                    <p className="diag-ok-dark">{t('editor.checked')}</p>
                  ) : (
                    <ul className="workshop-errors">
                      {general.map((m) => (
                        <li key={m}>{m}</li>
                      ))}
                      {byPath.size > 0 && (
                        <li>
                          {t('workshop.errorsInSteps', {
                            count: [...byPath.values()].flat().length,
                          })}
                        </li>
                      )}
                    </ul>
                  )}
                  <p className="hint">
                    {t('workshop.callAs', {
                      call: `${draft.name}(${draft.params.map((p) => p.name).join(', ')})`,
                    })}
                  </p>
                </div>
              )}
              {test && (
                <div className="card test-result" role="status">
                  <h3>{t('editor.testResult')}</h3>
                  <p>{t('editor.testFired', { count: test.fired, rounds: test.rounds })}</p>
                  {test.figures.slice(0, 4).map((f) => (
                    <p key={f.id} className="hint">
                      {t('editor.testFigure', {
                        name: f.name,
                        hits: f.hits,
                        damage: f.damage,
                        heal: f.heal,
                      })}
                    </p>
                  ))}
                  <p className="hint">
                    {t('editor.testWorld', { tiles: test.tilesChanged, spawns: test.spawns })}
                  </p>
                </div>
              )}
              <div className="editor-actions">
                <button type="button" className="btn" disabled={!valid} onClick={runTest}>
                  {t('editor.testRun')}
                </button>
                {draftFor && (
                  <button
                    type="button"
                    className="btn btn-soft"
                    onClick={() => {
                      removeEffect(draftFor);
                      setSelection({ kind: 'effect', name: null });
                    }}
                  >
                    {t('workshop.delete')}
                  </button>
                )}
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={!valid}
                  onClick={() => {
                    saveEffect({ ...draft, author: draft.author || author }, draftFor ?? undefined);
                    setDraftFor(draft.name);
                    setSelection({ kind: 'effect', name: draft.name });
                    setSaved(true);
                  }}
                >
                  {saved ? t('workshop.saved') : t('workshop.save')}
                </button>
              </div>
            </aside>
          </>
        )}
      </div>
    </div>
  );
}
