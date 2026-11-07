import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { testRunRule, type TestRunResult } from '../../bots/testRun';
import { DEFAULT_SETTINGS } from '../../engine/settings';
import type { NpcType } from '../../engine/types';
import type { EffectDef, Expr, ParamType, RuleDefinition, ValueType } from '../../lang/ast';
import { resolveBundle } from '../../lang/bundle';
import { validateEffect } from '../../lang/validator';
import { useProfile } from '../../store/profileStore';
import { allNpcTypes, useWorkshop } from '../../store/workshopStore';
import { Avatar } from '../components/Avatar';
import { CloseIcon } from '../components/Icons';
import { StmtList } from './EffectBlocks';
import { NpcEditor } from './NpcEditor';

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

type Selection = { kind: 'effect'; name: string | null } | { kind: 'npc'; id: string | null };

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

/** Effect workshop (SPEC 5.7, reference screen 7) – blocks view; pro code follows in v0.6. */
export function EffectWorkshop({ onClose }: Props) {
  const { t } = useTranslation();
  const author = useProfile((s) => s.name) || t('lobby.roles.hero');
  const effects = useWorkshop((s) => s.effects);
  const ownNpcs = useWorkshop((s) => s.npcTypes);
  const saveEffect = useWorkshop((s) => s.saveEffect);
  const removeEffect = useWorkshop((s) => s.removeEffect);
  const saveNpc = useWorkshop((s) => s.saveNpcType);
  const removeNpc = useWorkshop((s) => s.removeNpcType);
  const npcTypes = allNpcTypes(ownNpcs);

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
  const [test, setTest] = useState<TestRunResult | null>(null);
  const [saved, setSaved] = useState(false);

  // Switching the selected effect loads it into the draft.
  if (selection.kind === 'effect' && (selection.name ?? null) !== draftFor) {
    setDraftFor(selection.name ?? null);
    setDraft(original ?? emptyEffect(author, t('workshop.newEffectName')));
    setTest(null);
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
    () => validateEffect(draft, DEFAULT_SETTINGS, npcTypes, registry),
    [draft, npcTypes, registry],
  );
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
  const valid = errors.length === 0 && !nameTaken;
  const scope = new Map<string, ValueType>(draft.params.map((p) => [p.name.toLowerCase(), p.type]));
  const ctx = { npcTypes, effects: registry, self: draft.name };

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
    const bundle = resolveBundle(rule.ast, registry, npcTypes);
    setTest(
      testRunRule(
        null,
        { ...rule, bundle: { effects: bundle.effects, npcTypes: bundle.npcTypes } },
        Date.now() % 1000,
      ),
    );
  };

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
        <span className="pill workshop-mode">{t('workshop.blocksOnly')}</span>
      </header>
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
              onClick={() => setSelection({ kind: 'npc', id: null })}
            >
              {t('workshop.newNpc')}
            </button>
          </div>
        </aside>

        {selection.kind === 'npc' ? (
          <section className="editor-canvas workshop-canvas">
            <NpcEditor
              key={selection.id ?? 'new'}
              initial={ownNpcs.find((n) => n.id === selection.id) ?? null}
              takenIds={npcTypes.map((n) => n.id)}
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
        ) : (
          <>
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
                ctx={ctx}
                errors={byPath}
                path="body"
                onChange={(body) => {
                  setDraft({ ...draft, body });
                  setSaved(false);
                  setTest(null);
                }}
              />
              <p className="fair-note editor-note">{t('workshop.note')}</p>
            </section>
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
                  </div>
                ))}
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
              </div>
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
                        {t('workshop.errorsInSteps', { count: [...byPath.values()].flat().length })}
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
