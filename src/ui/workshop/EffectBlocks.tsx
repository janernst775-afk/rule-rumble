import { useTranslation } from 'react-i18next';
import type { NpcType, TileType } from '../../engine/types';
import type {
  CmpOp,
  Effect,
  EffectDef,
  EffectKind,
  Expr,
  ParamType,
  Stmt,
  StmtKind,
  Target,
  TileTarget,
  ValueType,
} from '../../lang/ast';
import { printStmtText } from '../../lang/printer';
import { CloseIcon, ChevronIcon } from '../components/Icons';
import { isCodeOnly } from './codeOnly';
import { TILE_TYPES } from '../editor/model';
import { EFFECT_KINDS } from '../ruleText';
import { elementType, exprKey, exprOptions, QUERY_ARGS, scopesOf, type Want } from './exprOptions';

type Scope = ReadonlyMap<string, ValueType>;

interface Ctx {
  npcTypes: readonly NpcType[];
  effects: readonly EffectDef[];
  /** Name of the effect being edited (calls to itself are allowed, depth-limited). */
  self: string;
  /** Opens the code view (for grey code blocks). */
  onOpenCode?: () => void;
}

function CodeBlock({ stmt, ctx, onRemove }: { stmt: Stmt; ctx: Ctx; onRemove: () => void }) {
  const { t } = useTranslation();
  return (
    <div className="stmt stmt-code">
      <div className="stmt-head">
        <span className="block-label">{t('workshop.codeBlock')}</span>
        <button
          type="button"
          className="code-block-open"
          title={t('workshop.codeBlockHint')}
          onClick={ctx.onOpenCode}
        >
          <pre>{printStmtText(stmt, 'de')}</pre>
        </button>
        <div className="block-tools">
          <button
            type="button"
            className="mini-icon"
            aria-label={t('editor.remove')}
            onClick={onRemove}
          >
            <CloseIcon size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------- expressions ----------

export function ExprEditor({
  expr,
  want,
  scope,
  onChange,
  label,
}: {
  expr: Expr;
  want: Want;
  scope: Scope;
  onChange: (e: Expr) => void;
  label: string;
}) {
  const { t } = useTranslation();
  const options = exprOptions(want, scope);
  const key = exprKey(expr);
  const tl = (l: [string, Record<string, string>?]) => {
    const [k, p] = l;
    if (!p) return t(k);
    const params = Object.fromEntries(
      Object.entries(p).map(([a, b]) => [a, b.includes('.') ? t(b) : b]),
    );
    return t(k, params);
  };
  return (
    <span className="expr">
      <select
        className="block-select"
        aria-label={label}
        value={options.some((o) => o.key === key) ? key : ''}
        onChange={(e) => {
          const opt = options.find((o) => o.key === e.target.value);
          if (opt) onChange(opt.create());
        }}
      >
        {!options.some((o) => o.key === key) && (
          <option value="">{t('workshop.expr.choose')}</option>
        )}
        {options.map((o) => (
          <option key={o.key} value={o.key}>
            {tl(o.label)}
          </option>
        ))}
      </select>
      {expr.kind === 'num' && (
        <input
          type="number"
          className="block-number-input"
          aria-label={t('editor.condition.number')}
          value={expr.value}
          onChange={(e) =>
            onChange({ kind: 'num', value: Math.round(Number(e.target.value)) || 0 })
          }
        />
      )}
      {expr.kind === 'str' && (
        <input
          className="block-text"
          aria-label={t('workshop.expr.text')}
          value={expr.value}
          maxLength={30}
          onChange={(e) => onChange({ kind: 'str', value: e.target.value })}
        />
      )}
      {expr.kind === 'query' && QUERY_ARGS[expr.name].length > 0 && (
        <span className="expr-args">
          (
          {QUERY_ARGS[expr.name].map((w, i) => (
            <ExprEditor
              key={i}
              expr={expr.args[i] ?? { kind: 'num', value: 1 }}
              want={w}
              scope={scope}
              label={`${label} ${i + 1}`}
              onChange={(a) => {
                const args = [...expr.args];
                args[i] = a;
                onChange({ ...expr, args });
              }}
            />
          ))}
          )
        </span>
      )}
    </span>
  );
}

// ---------- conditions ----------

type CondKind = 'chance' | 'cmp' | 'and' | 'or' | 'not';
const OPS: CmpOp[] = ['=', '!=', '<', '>', '<=', '>='];

function defaultCond(kind: CondKind): Expr {
  switch (kind) {
    case 'chance':
      return { kind: 'chance', percent: 30 };
    case 'cmp':
      return {
        kind: 'cmp',
        op: '=',
        left: { kind: 'num', value: 1 },
        right: { kind: 'num', value: 0 },
      };
    case 'and':
    case 'or':
      return { kind, items: [{ kind: 'chance', percent: 50 }] };
    case 'not':
      return { kind: 'not', item: { kind: 'chance', percent: 50 } };
  }
}

export function ConditionEditor({
  cond,
  scope,
  onChange,
}: {
  cond: Expr;
  scope: Scope;
  onChange: (e: Expr) => void;
}) {
  const { t } = useTranslation();
  const kind =
    (['chance', 'cmp', 'and', 'or', 'not'] as const).find((k) => k === cond.kind) ?? 'cmp';
  return (
    <span className={`cond cond-${kind}`}>
      <select
        className="block-select"
        aria-label={t('workshop.cond.kind')}
        value={kind}
        onChange={(e) => onChange(defaultCond(e.target.value as CondKind))}
      >
        {(['chance', 'cmp', 'and', 'or', 'not'] as const).map((k) => (
          <option key={k} value={k}>
            {t(`workshop.cond.${k}`)}
          </option>
        ))}
      </select>
      {cond.kind === 'chance' && (
        <span className="block-number">
          <input
            type="number"
            aria-label={t('editor.condition.chance')}
            min={1}
            max={99}
            value={cond.percent}
            onChange={(e) =>
              onChange({ kind: 'chance', percent: Math.round(Number(e.target.value)) || 1 })
            }
          />
          %
        </span>
      )}
      {cond.kind === 'cmp' && (
        <>
          <ExprEditor
            expr={cond.left}
            want="comparable"
            scope={scope}
            label={t('workshop.cond.left')}
            onChange={(left) => onChange({ ...cond, left })}
          />
          <select
            className="block-select"
            aria-label={t('editor.condition.op')}
            value={cond.op}
            onChange={(e) => onChange({ ...cond, op: e.target.value as CmpOp })}
          >
            {OPS.map((o) => (
              <option key={o}>{o}</option>
            ))}
          </select>
          <ExprEditor
            expr={cond.right}
            want="comparable"
            scope={scope}
            label={t('workshop.cond.right')}
            onChange={(right) => onChange({ ...cond, right })}
          />
        </>
      )}
      {(cond.kind === 'and' || cond.kind === 'or') && (
        <span className="cond-list">
          {cond.items.map((item, i) => (
            <span key={i} className="cond-item">
              {i > 0 && <span className="block-word">{t(`workshop.cond.${cond.kind}Word`)}</span>}
              <ConditionEditor
                cond={item}
                scope={scope}
                onChange={(c) =>
                  onChange({ ...cond, items: cond.items.map((x, j) => (j === i ? c : x)) })
                }
              />
              {cond.items.length > 1 && (
                <button
                  type="button"
                  className="mini-icon"
                  aria-label={t('editor.remove')}
                  onClick={() => onChange({ ...cond, items: cond.items.filter((_, j) => j !== i) })}
                >
                  <CloseIcon size={12} />
                </button>
              )}
            </span>
          ))}
          <button
            type="button"
            className="mini-btn"
            onClick={() =>
              onChange({ ...cond, items: [...cond.items, { kind: 'chance', percent: 50 }] })
            }
          >
            {t('workshop.cond.addPart')}
          </button>
        </span>
      )}
      {cond.kind === 'not' && (
        <ConditionEditor
          cond={cond.item}
          scope={scope}
          onChange={(item) => onChange({ kind: 'not', item })}
        />
      )}
    </span>
  );
}

// ---------- targets inside effects ----------

const FIXED_TARGETS = ['onTile', 'neighbors', 'nearest', 'random', 'all', 'allNpcs'] as const;

function TargetEditor({
  target,
  scope,
  onChange,
}: {
  target: Target;
  scope: Scope;
  onChange: (t: Target) => void;
}) {
  const { t } = useTranslation();
  const mode = target.kind === 'value' ? 'value' : target.kind;
  return (
    <span className="expr">
      <select
        className="block-select"
        aria-label={t('editor.targetLabel')}
        value={mode}
        onChange={(e) =>
          onChange(
            e.target.value === 'value'
              ? { kind: 'value', expr: defaultFigureExpr(scope) }
              : ({ kind: e.target.value } as Target),
          )
        }
      >
        <option value="value">{t('workshop.target.value')}</option>
        {FIXED_TARGETS.map((k) => (
          <option key={k} value={k}>
            {t(`editor.target.${k}`)}
          </option>
        ))}
      </select>
      {target.kind === 'value' && (
        <ExprEditor
          expr={target.expr}
          want="figureSet"
          scope={scope}
          label={t('workshop.target.value')}
          onChange={(expr) => onChange({ kind: 'value', expr })}
        />
      )}
    </span>
  );
}

function defaultFigureExpr(scope: Scope): Expr {
  for (const [name, type] of scope)
    if (type === 'figure' || type === 'figureSet') return { kind: 'var', name };
  return { kind: 'query', name: 'allFigures', args: [] };
}

function defaultTileExpr(scope: Scope): Expr {
  for (const [name, type] of scope)
    if (type === 'tile' || type === 'tileSet') return { kind: 'var', name };
  return { kind: 'tileRef', tile: { kind: 'eventTile' } };
}

const FIXED_TILES = [
  'eventTile',
  'neighborTiles',
  'randomTile',
  'randomEmptyTile',
  'tilesOfType',
] as const;

function TileTargetEditor({
  tile,
  scope,
  onChange,
}: {
  tile: TileTarget;
  scope: Scope;
  onChange: (t: TileTarget) => void;
}) {
  const { t } = useTranslation();
  const mode = tile.kind;
  return (
    <span className="expr">
      <select
        className="block-select"
        aria-label={t('editor.tileLabel')}
        value={mode}
        onChange={(e) => {
          const k = e.target.value;
          if (k === 'value') onChange({ kind: 'value', expr: defaultTileExpr(scope) });
          else if (k === 'tilesOfType') onChange({ kind: 'tilesOfType', tileType: 'lava' });
          else onChange({ kind: k } as TileTarget);
        }}
      >
        <option value="value">{t('workshop.target.tileValue')}</option>
        {FIXED_TILES.map((k) => (
          <option key={k} value={k}>
            {t(`editor.tile.${k}`)}
          </option>
        ))}
      </select>
      {tile.kind === 'value' && (
        <ExprEditor
          expr={tile.expr}
          want="tileSet"
          scope={scope}
          label={t('workshop.target.tileValue')}
          onChange={(expr) => onChange({ kind: 'value', expr })}
        />
      )}
      {tile.kind === 'tilesOfType' && (
        <select
          className="block-select"
          aria-label={t('editor.tileType')}
          value={tile.tileType}
          onChange={(e) => onChange({ kind: 'tilesOfType', tileType: e.target.value as TileType })}
        >
          {TILE_TYPES.map((v) => (
            <option key={v} value={v}>
              {t(`game.tileTypes.${v}`)}
            </option>
          ))}
        </select>
      )}
    </span>
  );
}

// ---------- effects inside effects ----------

function defaultStepEffect(kind: EffectKind, scope: Scope): Effect {
  const target: Target = { kind: 'value', expr: defaultFigureExpr(scope) };
  const at: TileTarget = { kind: 'value', expr: defaultTileExpr(scope) };
  switch (kind) {
    case 'spawn':
      return { kind, npcType: 'zombie', at };
    case 'damage':
    case 'heal':
    case 'shield':
      return { kind, target, amount: 1 };
    case 'skip':
      return { kind, target, turns: 1 };
    case 'moveMod':
      return { kind, target, delta: 1, rounds: 1 };
    case 'wheelMod':
      return { kind, target, delta: 10, rounds: 1 };
    case 'teleport':
      return { kind, target };
    case 'push':
      return { kind, target, from: { kind: 'eventTile' }, distance: 1 };
    case 'setTileType':
      return { kind, at, tileType: 'lava' };
    case 'removeTile':
    case 'addTileNear':
      return { kind, at };
    case 'setVar':
      return {
        kind,
        scope: { kind: 'world' },
        name: 'punkte',
        op: '+',
        value: { kind: 'num', value: 1 },
      };
    case 'message':
    case 'code':
      return { kind: 'message', text: 'Achtung!' };
    case 'call':
      return { kind, effect: '', args: [] };
  }
}

const PARAM_WANT: Record<ParamType, Want> = {
  number: 'number',
  text: 'text',
  figure: 'figure',
  tile: 'tile',
  figureSet: 'figureSet',
  tileSet: 'tileSet',
  npcType: 'text',
  texture: 'text',
  sound: 'text',
};

function defaultForParam(type: ParamType, scope: Scope): Expr {
  switch (type) {
    case 'number':
      return { kind: 'num', value: 1 };
    case 'figure':
    case 'figureSet':
      return defaultFigureExpr(scope);
    case 'tile':
    case 'tileSet':
      return defaultTileExpr(scope);
    default:
      return { kind: 'str', value: '' };
  }
}

function callFor(def: EffectDef, scope: Scope): Effect {
  return {
    kind: 'call',
    effect: def.name,
    args: def.params.map((p) => defaultForParam(p.type, scope)),
  };
}

function EffectStep({
  effect,
  scope,
  ctx,
  onChange,
}: {
  effect: Effect;
  scope: Scope;
  ctx: Ctx;
  onChange: (e: Effect) => void;
}) {
  const { t } = useTranslation();
  const number = (
    label: string,
    value: number,
    min: number,
    max: number,
    set: (n: number) => void,
  ) => (
    <input
      type="number"
      className="block-number-input"
      aria-label={label}
      min={min}
      max={max}
      value={value}
      onChange={(e) => set(Math.round(Number(e.target.value)) || 0)}
    />
  );
  switch (effect.kind) {
    case 'spawn':
      return (
        <>
          <select
            className="block-select"
            aria-label={t('editor.npcType')}
            value={effect.npcType}
            onChange={(e) => onChange({ ...effect, npcType: e.target.value })}
          >
            {ctx.npcTypes.map((n) => (
              <option key={n.id} value={n.id}>
                {n.name}
              </option>
            ))}
          </select>
          <span className="block-word">{t('editor.on')}</span>
          <TileTargetEditor
            tile={effect.at}
            scope={scope}
            onChange={(at) => onChange({ ...effect, at })}
          />
        </>
      );
    case 'damage':
    case 'heal':
    case 'shield':
    case 'skip':
    case 'teleport':
      return (
        <TargetEditor
          target={effect.target}
          scope={scope}
          onChange={(target) => onChange({ ...effect, target })}
        />
      );
    case 'moveMod':
    case 'wheelMod':
      return (
        <>
          <TargetEditor
            target={effect.target}
            scope={scope}
            onChange={(target) => onChange({ ...effect, target })}
          />
          {number(t('editor.delta'), effect.delta, -50, 50, (delta) =>
            onChange({ ...effect, delta }),
          )}
          <span className="block-word">{t('editor.for')}</span>
          {number(t('editor.rounds'), effect.rounds, 1, 5, (rounds) =>
            onChange({ ...effect, rounds }),
          )}
          <span className="block-word">{t('editor.rounds')}</span>
        </>
      );
    case 'push':
      return (
        <>
          <TargetEditor
            target={effect.target}
            scope={scope}
            onChange={(target) => onChange({ ...effect, target })}
          />
          <span className="block-word">{t('editor.awayFrom')}</span>
          <TileTargetEditor
            tile={effect.from}
            scope={scope}
            onChange={(from) => onChange({ ...effect, from })}
          />
        </>
      );
    case 'setTileType':
      return (
        <>
          <TileTargetEditor
            tile={effect.at}
            scope={scope}
            onChange={(at) => onChange({ ...effect, at })}
          />
          <span className="block-word">{t('editor.into')}</span>
          <select
            className="block-select"
            aria-label={t('editor.tileType')}
            value={effect.tileType}
            onChange={(e) => onChange({ ...effect, tileType: e.target.value as TileType })}
          >
            {TILE_TYPES.map((v) => (
              <option key={v} value={v}>
                {t(`game.tileTypes.${v}`)}
              </option>
            ))}
          </select>
        </>
      );
    case 'removeTile':
    case 'addTileNear':
      return (
        <TileTargetEditor
          tile={effect.at}
          scope={scope}
          onChange={(at) => onChange({ ...effect, at })}
        />
      );
    case 'setVar':
      return (
        <>
          <select
            className="block-select"
            aria-label={t('editor.scope')}
            value={effect.scope.kind}
            onChange={(e) =>
              onChange({
                ...effect,
                scope:
                  e.target.value === 'world'
                    ? { kind: 'world' }
                    : {
                        kind: 'figures',
                        target: { kind: 'value', expr: defaultFigureExpr(scope) },
                      },
              })
            }
          >
            <option value="world">{t('editor.world')}</option>
            <option value="figures">{t('workshop.figuresVar')}</option>
          </select>
          {effect.scope.kind === 'figures' && (
            <TargetEditor
              target={effect.scope.target}
              scope={scope}
              onChange={(target) => onChange({ ...effect, scope: { kind: 'figures', target } })}
            />
          )}
          <input
            className="block-text"
            aria-label={t('editor.varName')}
            value={effect.name}
            maxLength={24}
            onChange={(e) => onChange({ ...effect, name: e.target.value.toLowerCase() })}
          />
          <select
            className="block-select"
            aria-label={t('editor.varOp')}
            value={effect.op}
            onChange={(e) => onChange({ ...effect, op: e.target.value as '=' | '+' | '-' })}
          >
            {['=', '+', '-'].map((o) => (
              <option key={o}>{o}</option>
            ))}
          </select>
          <ExprEditor
            expr={effect.value}
            want="number"
            scope={scope}
            label={t('editor.condition.number')}
            onChange={(value) => onChange({ ...effect, value })}
          />
        </>
      );
    case 'message':
      return (
        <input
          className="block-text"
          aria-label={t('editor.messageText')}
          value={effect.text}
          maxLength={80}
          onChange={(e) => onChange({ ...effect, text: e.target.value })}
        />
      );
    case 'call': {
      const def = ctx.effects.find((d) => d.name.toLowerCase() === effect.effect.toLowerCase());
      return (
        <>
          <select
            className="block-select"
            aria-label={t('workshop.callEffect')}
            value={def?.name ?? ''}
            onChange={(e) => {
              const next = ctx.effects.find((d) => d.name === e.target.value);
              if (next) onChange(callFor(next, scope));
            }}
          >
            {!def && <option value="">{t('workshop.expr.choose')}</option>}
            {ctx.effects.map((d) => (
              <option key={d.name} value={d.name}>
                {d.name}
              </option>
            ))}
          </select>
          {def?.params.map((p, i) => (
            <span key={p.name} className="call-arg">
              <span className="block-word">{p.name}:</span>
              <ExprEditor
                expr={effect.args[i] ?? defaultForParam(p.type, scope)}
                want={PARAM_WANT[p.type]}
                scope={scope}
                label={p.name}
                onChange={(a) => {
                  const args = [...effect.args];
                  args[i] = a;
                  onChange({ ...effect, args });
                }}
              />
            </span>
          ))}
        </>
      );
    }
  }
}

// ---------- statements ----------

type StepChoice = `do:${EffectKind}` | `call:${string}` | Exclude<StmtKind, 'do'>;

function defaultStmt(choice: StepChoice, scope: Scope, ctx: Ctx): Stmt {
  if (choice.startsWith('do:')) {
    return { kind: 'do', effect: defaultStepEffect(choice.slice(3) as EffectKind, scope) };
  }
  if (choice.startsWith('call:')) {
    const def = ctx.effects.find((d) => d.name === choice.slice(5));
    return {
      kind: 'do',
      effect: def ? callFor(def, scope) : { kind: 'call', effect: '', args: [] },
    };
  }
  switch (choice as Exclude<StmtKind, 'do'>) {
    case 'if':
      return { kind: 'if', cond: { kind: 'chance', percent: 50 }, then: [], else: [] };
    case 'repeat':
      return { kind: 'repeat', times: { kind: 'num', value: 3 }, body: [] };
    case 'forEach':
      return {
        kind: 'forEach',
        var: 'f',
        in: { kind: 'query', name: 'allFigures', args: [] },
        body: [],
      };
    case 'pick':
      return { kind: 'pick', var: 'z', from: { kind: 'query', name: 'allFigures', args: [] } };
    case 'let':
      return { kind: 'let', name: 'x', value: { kind: 'num', value: 1 } };
    case 'play':
      return { kind: 'play', sound: { kind: 'str', value: 'pling' } };
    case 'texture':
      return {
        kind: 'texture',
        tile: { kind: 'tileRef', tile: { kind: 'eventTile' } },
        name: { kind: 'str', value: 'Sumpf' },
      };
    case 'wait':
      return { kind: 'wait', seconds: 0.5 };
    // Profi-Code statements come from the code view only.
    case 'while':
      return { kind: 'while', cond: { kind: 'chance', percent: 50 }, body: [] };
    case 'return':
      return { kind: 'return', value: { kind: 'none' } };
    case 'send':
      return { kind: 'send', event: 'signal' };
    case 'after':
      return { kind: 'after', rounds: 1, body: [] };
    case 'listAdd':
      return { kind: 'listAdd', list: 'liste', value: { kind: 'num', value: 1 } };
    case 'say':
      return { kind: 'say', text: { kind: 'str', value: 'Achtung!' } };
  }
}

function AddStep({ scope, ctx, onAdd }: { scope: Scope; ctx: Ctx; onAdd: (s: Stmt) => void }) {
  const { t } = useTranslation();
  return (
    <select
      className="add-step"
      aria-label={t('workshop.addStep')}
      value=""
      onChange={(e) => {
        if (e.target.value) onAdd(defaultStmt(e.target.value as StepChoice, scope, ctx));
      }}
    >
      <option value="">{t('workshop.addStep')}</option>
      <optgroup label={t('workshop.groups.control')}>
        {(['if', 'repeat', 'forEach', 'pick', 'let'] as const).map((k) => (
          <option key={k} value={k}>
            {t(`workshop.stmt.${k}`)}
          </option>
        ))}
      </optgroup>
      <optgroup label={t('workshop.groups.actions')}>
        {EFFECT_KINDS.map((k) => (
          <option key={k} value={`do:${k}`}>
            {t(`editor.effect.${k}`)}
          </option>
        ))}
        {(['play', 'texture', 'wait'] as const).map((k) => (
          <option key={k} value={k}>
            {t(`workshop.stmt.${k}`)}
          </option>
        ))}
      </optgroup>
      {ctx.effects.length > 0 && (
        <optgroup label={t('workshop.groups.effects')}>
          {ctx.effects.map((d) => (
            <option key={d.name} value={`call:${d.name}`}>
              {d.symbol} {d.name}
            </option>
          ))}
        </optgroup>
      )}
    </select>
  );
}

function StmtBlock({
  stmt,
  scope,
  ctx,
  errors,
  path,
  onChange,
  onRemove,
  onUp,
  onDown,
}: {
  stmt: Stmt;
  scope: Scope;
  ctx: Ctx;
  errors: Map<string, string[]>;
  path: string;
  onChange: (s: Stmt) => void;
  onRemove: () => void;
  onUp?: (() => void) | undefined;
  onDown?: (() => void) | undefined;
}) {
  const { t } = useTranslation();
  if (isCodeOnly(stmt)) return <CodeBlock stmt={stmt} ctx={ctx} onRemove={onRemove} />;
  const label =
    stmt.kind === 'do'
      ? stmt.effect.kind === 'call'
        ? t('workshop.stmt.call')
        : t(`editor.effect.${stmt.effect.kind}`)
      : t(`workshop.stmt.${stmt.kind}`);
  const own = errors.get(path) ?? [];
  const tone =
    stmt.kind === 'do' || stmt.kind === 'play' || stmt.kind === 'texture' || stmt.kind === 'wait'
      ? 'then'
      : stmt.kind === 'if'
        ? 'when'
        : 'and';
  return (
    <div className={`stmt stmt-${tone}${own.length ? ' has-error' : ''}`}>
      <div className="stmt-head">
        <span className="block-label">{label}</span>
        <div className="block-fields">
          {stmt.kind === 'do' && (
            <EffectStep
              effect={stmt.effect}
              scope={scope}
              ctx={ctx}
              onChange={(effect) => onChange({ kind: 'do', effect })}
            />
          )}
          {stmt.kind === 'if' && (
            <ConditionEditor
              cond={stmt.cond}
              scope={scope}
              onChange={(cond) => onChange({ ...stmt, cond })}
            />
          )}
          {stmt.kind === 'repeat' && (
            <>
              <ExprEditor
                expr={stmt.times}
                want="number"
                scope={scope}
                label={t('workshop.times')}
                onChange={(times) => onChange({ ...stmt, times })}
              />
              <span className="block-word">{t('workshop.timesWord')}</span>
            </>
          )}
          {(stmt.kind === 'forEach' || stmt.kind === 'pick') && (
            <>
              <input
                className="block-text var-name"
                aria-label={t('workshop.varName')}
                value={stmt.var}
                maxLength={16}
                onChange={(e) => onChange({ ...stmt, var: e.target.value.toLowerCase() })}
              />
              <span className="block-word">
                {stmt.kind === 'forEach' ? t('workshop.in') : t('workshop.from')}
              </span>
              <ExprEditor
                expr={stmt.kind === 'forEach' ? stmt.in : stmt.from}
                want="anySet"
                scope={scope}
                label={t('workshop.set')}
                onChange={(e) =>
                  onChange(stmt.kind === 'forEach' ? { ...stmt, in: e } : { ...stmt, from: e })
                }
              />
            </>
          )}
          {stmt.kind === 'let' && (
            <>
              <input
                className="block-text var-name"
                aria-label={t('workshop.varName')}
                value={stmt.name}
                maxLength={16}
                onChange={(e) => onChange({ ...stmt, name: e.target.value.toLowerCase() })}
              />
              <span className="block-word">=</span>
              <ExprEditor
                expr={stmt.value}
                want="comparable"
                scope={scope}
                label={t('workshop.value')}
                onChange={(value) => onChange({ ...stmt, value })}
              />
            </>
          )}
          {stmt.kind === 'play' && (
            <ExprEditor
              expr={stmt.sound}
              want="sound"
              scope={scope}
              label={t('workshop.sound')}
              onChange={(sound) => onChange({ ...stmt, sound })}
            />
          )}
          {stmt.kind === 'texture' && (
            <>
              <ExprEditor
                expr={stmt.tile}
                want="tileSet"
                scope={scope}
                label={t('editor.tileLabel')}
                onChange={(tile) => onChange({ ...stmt, tile })}
              />
              <ExprEditor
                expr={stmt.name}
                want="texture"
                scope={scope}
                label={t('editor.textureName')}
                onChange={(name) => onChange({ ...stmt, name })}
              />
            </>
          )}
          {stmt.kind === 'wait' && (
            <span className="block-number">
              <input
                type="number"
                aria-label={t('workshop.seconds')}
                min={0}
                max={3}
                step={0.1}
                value={stmt.seconds}
                onChange={(e) =>
                  onChange({
                    ...stmt,
                    seconds: Math.max(0, Math.min(3, Number(e.target.value) || 0)),
                  })
                }
              />
              s
            </span>
          )}
        </div>
        <div className="block-tools">
          {onUp && (
            <button type="button" className="mini-icon" aria-label={t('editor.up')} onClick={onUp}>
              <ChevronIcon dir="up" size={14} />
            </button>
          )}
          {onDown && (
            <button
              type="button"
              className="mini-icon"
              aria-label={t('editor.down')}
              onClick={onDown}
            >
              <ChevronIcon dir="down" size={14} />
            </button>
          )}
          <button
            type="button"
            className="mini-icon"
            aria-label={t('editor.remove')}
            onClick={onRemove}
          >
            <CloseIcon size={14} />
          </button>
        </div>
      </div>
      {own.length > 0 && (
        <ul className="block-errors" role="alert">
          {own.map((m) => (
            <li key={m}>{m}</li>
          ))}
        </ul>
      )}
      {stmt.kind === 'if' && (
        <div className="stmt-children">
          <StmtList
            stmts={stmt.then}
            scope={scope}
            ctx={ctx}
            errors={errors}
            path={`${path}.then`}
            onChange={(then) => onChange({ ...stmt, then })}
          />
          <span className="stmt-else">{t('workshop.else')}</span>
          <StmtList
            stmts={stmt.else}
            scope={scope}
            ctx={ctx}
            errors={errors}
            path={`${path}.else`}
            onChange={(els) => onChange({ ...stmt, else: els })}
          />
        </div>
      )}
      {stmt.kind === 'repeat' && (
        <div className="stmt-children">
          <StmtList
            stmts={stmt.body}
            scope={scope}
            ctx={ctx}
            errors={errors}
            path={`${path}.body`}
            onChange={(body) => onChange({ ...stmt, body })}
          />
        </div>
      )}
      {stmt.kind === 'forEach' && (
        <div className="stmt-children">
          <StmtList
            stmts={stmt.body}
            scope={new Map([...scope, [stmt.var.toLowerCase(), elementType(stmt.in, scope)]])}
            ctx={ctx}
            errors={errors}
            path={`${path}.body`}
            onChange={(body) => onChange({ ...stmt, body })}
          />
        </div>
      )}
    </div>
  );
}

function move<T>(list: T[], i: number, dir: -1 | 1): T[] {
  const j = i + dir;
  if (j < 0 || j >= list.length) return list;
  const next = [...list];
  [next[i], next[j]] = [next[j]!, next[i]!];
  return next;
}

export function StmtList({
  stmts,
  scope,
  ctx,
  errors,
  path,
  onChange,
}: {
  stmts: Stmt[];
  scope: Scope;
  ctx: Ctx;
  errors: Map<string, string[]>;
  path: string;
  onChange: (s: Stmt[]) => void;
}) {
  const scopes = scopesOf(stmts, scope);
  const after = scopesOf([...stmts, { kind: 'wait', seconds: 0 }], scope).at(-1) ?? new Map(scope);
  return (
    <div className="stmt-list">
      {stmts.map((s, i) => (
        <StmtBlock
          key={i}
          stmt={s}
          scope={scopes[i] ?? scope}
          ctx={ctx}
          errors={errors}
          path={`${path}.${i}`}
          onChange={(next) => onChange(stmts.map((x, j) => (j === i ? next : x)))}
          onRemove={() => onChange(stmts.filter((_, j) => j !== i))}
          onUp={i > 0 ? () => onChange(move(stmts, i, -1)) : undefined}
          onDown={i < stmts.length - 1 ? () => onChange(move(stmts, i, 1)) : undefined}
        />
      ))}
      <AddStep scope={after} ctx={ctx} onAdd={(s) => onChange([...stmts, s])} />
    </div>
  );
}
