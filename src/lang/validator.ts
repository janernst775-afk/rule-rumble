// Validator for rules, own effects and Profi-Code (SPEC 5.6–5.8): types, context values
// per trigger, limits (SPEC 6), "rules are the same for everyone" and the settings of the
// running game (e.g. "Profi-Code erlaubt").
import { CODE_LIMITS as CL, EFFECT_LIMITS as EL, RULE_LIMITS as L } from '../engine/limits';
import { DEFAULT_SETTINGS } from '../engine/settings';
import type { NpcType, Settings, TileType } from '../engine/types';
import type {
  Effect,
  EffectDef,
  Expr,
  FigureRef,
  FunctionDef,
  NpcCode,
  ParamType,
  RuleAST,
  Stmt,
  Target,
  TileRef,
  TileTarget,
  ValueType,
} from './ast';
import { hasAnchor, TRIGGER_CONTEXT, type TriggerContext } from './context';
import { QUERY_W, lookup } from './keywords';

export interface ValidationError {
  /** i18n key suffix: validation.<code> */
  code: string;
  /** Location, e.g. "effects.1", "conditions.0" or "body.2.then.0" */
  path: string;
  params?: Record<string, string | number>;
  /** Source line, if the statement came from code text. */
  line?: number;
}

export const TILE_TYPES: readonly TileType[] = [
  'normal',
  'lava',
  'eis',
  'heilquelle',
  'falle',
  'wasser',
];

/** Identity properties are never readable (SPEC 6.1, CLAUDE.md rule 5). */
const FORBIDDEN_VARS = new Set([
  'rolle',
  'role',
  'name',
  'controller',
  'steuerung',
  'ersteller',
  'author',
  'autor',
  'kind',
  'art',
  'spieler',
  'player',
  'boss',
  'held',
  'hero',
]);

const VAR_NAME = /^[a-zäöüß_][a-z0-9äöüß_]*$/;
export const EFFECT_NAME = /^[A-Za-zÄÖÜäöüß_][A-Za-zÄÖÜäöüß_0-9]*$/;

/** Inside an effect only `feld` (the place of the event) is implicitly available. */
const EFFECT_CONTEXT: TriggerContext = {
  figures: [],
  eventTile: true,
  fromTile: false,
  amount: false,
};

type T = ValueType | 'none' | 'unknown';

/** Result type of each query and the types of its arguments. */
const QUERY_SIG: Record<string, { args: ValueType[]; result: ValueType; random?: boolean }> = {
  figuresOn: { args: ['tile'], result: 'figureSet' },
  neighborTiles: { args: ['tile', 'number'], result: 'tileSet' },
  tilesOfType: { args: ['text'], result: 'tileSet' },
  tilesWithTexture: { args: ['text'], result: 'tileSet' },
  emptyTiles: { args: [], result: 'tileSet' },
  allFigures: { args: [], result: 'figureSet' },
  allNpcs: { args: [], result: 'figureSet' },
  nearestFigure: { args: ['tile'], result: 'figure' },
  distance: { args: ['tile', 'tile'], result: 'number' },
  randomNumber: { args: ['number', 'number'], result: 'number', random: true },
  count: { args: ['figureSet'], result: 'number' },
  edgeTiles: { args: [], result: 'tileSet' },
};

const FIGURE_PROPS: Record<string, T> = {
  hp: 'number',
  maxHp: 'number',
  move: 'number',
  wheelChance: 'number',
  shield: 'number',
  tile: 'tile',
};
const TILE_PROPS: Record<string, T> = { type: 'text', figureCount: 'number', texture: 'text' };

interface Env {
  ctx: TriggerContext;
  inEffect: boolean;
  settings: Settings;
  npcTypes: readonly NpcType[];
  effects: readonly EffectDef[];
  functions: readonly FunctionDef[];
  scope: Map<string, T>;
  errors: ValidationError[];
  /** NPC "…" ZUG: `selbst` is available. */
  self: boolean;
  /** Inside FUNKTION: no world changes, GIB ZURÜCK allowed. */
  pure: boolean;
  /** Line of the statement being checked (code text only). */
  line: number | undefined;
  /** A Profi-Code construct was used (SPEC 5.8). */
  pro: boolean;
}

function newEnv(
  ctx: TriggerContext,
  settings: Settings,
  npcTypes: readonly NpcType[],
  effects: readonly EffectDef[],
  functions: readonly FunctionDef[],
  extra: Partial<Env> = {},
): Env {
  return {
    ctx,
    inEffect: false,
    settings,
    npcTypes,
    effects,
    functions,
    scope: new Map(),
    errors: [],
    self: false,
    pure: false,
    line: undefined,
    pro: false,
    ...extra,
  };
}

function err(env: Env, code: string, path: string, params?: ValidationError['params']): void {
  const e: ValidationError = params ? { code, path, params } : { code, path };
  if (env.line !== undefined) e.line = env.line;
  env.errors.push(e);
}

/** Marks a Profi-Code construct; rejected when the game does not allow Profi-Code. */
function pro(env: Env, path: string): void {
  if (!env.pro && !env.settings.rules.proCodeAllowed) err(env, 'proCodeDisabled', path);
  env.pro = true;
}

function checkFigureRef(env: Env, ref: FigureRef, path: string): void {
  if (!env.ctx.figures.includes(ref)) err(env, 'contextMissing', path, { value: ref });
}

function checkTileRef(env: Env, tile: TileRef, path: string): void {
  if (tile.kind === 'eventTile' && !env.ctx.eventTile) {
    err(env, 'contextMissing', path, { value: 'eventTile' });
  } else if (tile.kind === 'fromTile' && !env.ctx.fromTile) {
    err(env, 'contextMissing', path, { value: 'fromTile' });
  } else if (tile.kind === 'figureTile') {
    checkFigureRef(env, tile.ref, path);
  }
}

function checkVarName(env: Env, name: string, path: string): void {
  const n = name.toLowerCase();
  if (FORBIDDEN_VARS.has(n)) err(env, 'forbiddenProperty', path, { value: name });
  else if (!VAR_NAME.test(n) || n.length > 24) err(env, 'varName', path, { value: name });
}

function randomForbidden(env: Env, path: string): void {
  if (!env.settings.rules.allowRandom) err(env, 'randomNotAllowed', path);
}

/** Can a value of type `actual` be used where `expected` is needed? */
export function assignable(actual: T, expected: ValueType): boolean {
  if (actual === 'unknown') return true;
  if (actual === expected) return true;
  if (actual === 'none') return expected === 'figure' || expected === 'tile';
  // Lists (Profi-Code) may hold figures or tiles; the runtime picks what fits.
  if (expected === 'figureSet') return actual === 'figure' || actual === 'list';
  if (expected === 'tileSet') return actual === 'tile' || actual === 'list' || actual === 'figure';
  if (
    expected === 'text' ||
    expected === 'npcType' ||
    expected === 'texture' ||
    expected === 'sound'
  ) {
    return actual === 'text' || actual === 'npcType' || actual === 'texture' || actual === 'sound';
  }
  return false;
}

function exprType(env: Env, e: Expr, path: string): T {
  switch (e.kind) {
    case 'num':
      if (!Number.isFinite(e.value) || Math.abs(e.value) > L.variable.max) {
        err(env, 'numberRange', path, { min: L.variable.min, max: L.variable.max });
      }
      return 'number';
    case 'str':
      return 'text';
    case 'none':
      return 'none';
    case 'figureProp':
      checkFigureRef(env, e.ref, path);
      return 'number';
    case 'figureVar':
      checkFigureRef(env, e.ref, path);
      checkVarName(env, e.name, path);
      return 'number';
    case 'tileProp':
      checkTileRef(env, e.tile, path);
      return e.prop === 'figureCount' ? 'number' : 'text';
    case 'global':
      return 'number';
    case 'worldVar':
      checkVarName(env, e.name, path);
      return 'number';
    case 'amount':
      if (!env.ctx.amount) err(env, 'contextMissing', path, { value: 'amount' });
      return 'number';
    case 'chance':
      randomForbidden(env, path);
      if (!Number.isInteger(e.percent) || e.percent < 1 || e.percent > 99) {
        err(env, 'chanceRange', path);
      }
      return 'bool';
    case 'not':
      expectBool(env, e.item, `${path}.not`);
      return 'bool';
    case 'and':
    case 'or':
      e.items.forEach((item, i) => expectBool(env, item, `${path}.${i}`));
      return 'bool';
    case 'cmp': {
      const lt = exprType(env, e.left, `${path}.left`);
      const rt = exprType(env, e.right, `${path}.right`);
      const numeric = lt === 'number' && rt === 'number';
      const equality = e.op === '=' || e.op === '!=';
      const sameKind =
        assignable(lt, rt === 'none' ? 'figure' : (rt as ValueType)) ||
        assignable(rt, lt === 'none' ? 'figure' : (lt as ValueType));
      const comparable = lt === 'unknown' || rt === 'unknown' || numeric || sameKind;
      if (lt === 'bool' || rt === 'bool' || !comparable) err(env, 'typeMismatch', path);
      else if (!numeric && !equality && lt !== 'unknown' && rt !== 'unknown') {
        err(env, 'stringCompare', path);
      }
      const pair = [e.left, e.right];
      const typeSide = pair.find(
        (x) => (x.kind === 'tileProp' || x.kind === 'varProp') && x.prop === 'type',
      );
      const strSide = pair.find((x) => x.kind === 'str');
      if (typeSide && strSide?.kind === 'str' && !TILE_TYPES.includes(strSide.value as TileType)) {
        err(env, 'unknownTileType', path, { value: strSide.value });
      }
      return 'bool';
    }
    case 'var': {
      const t = env.scope.get(e.name.toLowerCase());
      if (!t) {
        err(env, 'unknownVariable', path, { value: e.name });
        return 'unknown';
      }
      return t;
    }
    case 'varProp': {
      const t = env.scope.get(e.name.toLowerCase());
      if (!t) {
        err(env, 'unknownVariable', path, { value: e.name });
        return 'unknown';
      }
      return propType(env, t, e.prop, `${e.name}.${e.prop}`, path);
    }
    case 'prop':
      pro(env, path);
      return propType(env, exprType(env, e.of, `${path}.of`), e.prop, e.prop, path);
    case 'self':
      pro(env, path);
      if (!env.self) err(env, 'selfOutsideNpc', path);
      return 'figure';
    case 'arith': {
      pro(env, path);
      const lt = exprType(env, e.left, `${path}.left`);
      const rt = exprType(env, e.right, `${path}.right`);
      if (e.op === '+' && (lt === 'text' || rt === 'text')) return 'text';
      const numeric = (t: T) => t === 'number' || t === 'unknown';
      if (!numeric(lt) || !numeric(rt)) err(env, 'typeMismatch', path);
      return lt === 'unknown' || rt === 'unknown' ? 'unknown' : 'number';
    }
    case 'list':
      pro(env, path);
      if (e.items.length > EL.maxListLength) {
        err(env, 'listTooLong', path, { max: EL.maxListLength });
      }
      e.items.forEach((item, i) => exprType(env, item, `${path}.${i}`));
      return 'list';
    case 'fcall': {
      pro(env, path);
      const def = env.functions.find((f) => f.name.toLowerCase() === e.name.toLowerCase());
      if (!def) err(env, 'unknownFunction', path, { value: e.name });
      else if (def.params.length !== e.args.length) {
        err(env, 'argCount', path, { expected: def.params.length });
      }
      e.args.forEach((a, i) => exprType(env, a, `${path}.args.${i}`));
      return 'unknown';
    }
    case 'query': {
      const sig = QUERY_SIG[e.name];
      if (!sig) {
        err(env, 'unknownQuery', path, { value: e.name });
        return 'unknown';
      }
      if (sig.random) randomForbidden(env, path);
      if (e.args.length !== sig.args.length) {
        err(env, 'argCount', path, { expected: sig.args.length });
      }
      e.args.forEach((a, i) => {
        const at = exprType(env, a, `${path}.args.${i}`);
        const expected = sig.args[i];
        if (!expected) return;
        // count() accepts any set; tile arguments also accept figures (their tile).
        const ok =
          (e.name === 'count' &&
            (assignable(at, 'figureSet') || assignable(at, 'tileSet') || at === 'list')) ||
          (expected === 'tile' && at === 'figure') ||
          assignable(at, expected);
        if (!ok) err(env, 'typeMismatch', `${path}.args.${i}`);
      });
      return sig.result;
    }
    case 'figureRef':
      checkFigureRef(env, e.ref, path);
      return 'figure';
    case 'tileRef':
      checkTileRef(env, e.tile, path);
      return 'tile';
    case 'targets':
      checkTarget(env, e.target, path);
      return 'figureSet';
    case 'tiles':
      checkTileTarget(env, e.target, path);
      return 'tileSet';
  }
}

function expectBool(env: Env, e: Expr, path: string): void {
  const t = exprType(env, e, path);
  if (t !== 'bool' && t !== 'unknown') err(env, 'notACondition', path);
}

/** Type of `value.prop` for a value of type `t`. */
function propType(env: Env, t: T, prop: string, shown: string, path: string): T {
  if (t === 'unknown') {
    if (FORBIDDEN_VARS.has(prop.toLowerCase()))
      err(env, 'forbiddenProperty', path, { value: prop });
    return 'unknown';
  }
  if (t === 'figure' || t === 'none') {
    if (FIGURE_PROPS[prop]) return FIGURE_PROPS[prop] as T;
    checkVarName(env, prop, path);
    return 'number';
  }
  if (t === 'tile' && TILE_PROPS[prop]) return TILE_PROPS[prop] as T;
  if ((t === 'list' || t === 'figureSet' || t === 'tileSet') && prop === 'length') return 'number';
  err(env, 'unknownProperty', path, { value: shown });
  return 'unknown';
}

function checkTarget(env: Env, t: Target, path: string): void {
  switch (t.kind) {
    case 'ref':
      checkFigureRef(env, t.ref, path);
      break;
    case 'onTile':
    case 'neighbors':
    case 'nearest':
      if (!hasAnchor(env.ctx)) err(env, 'contextMissing', path, { value: t.kind });
      break;
    case 'random':
      randomForbidden(env, path);
      break;
    case 'all':
    case 'allNpcs':
      break;
    case 'value': {
      const vt = exprType(env, t.expr, path);
      if (!assignable(vt, 'figureSet')) err(env, 'typeMismatch', path);
      break;
    }
  }
}

function checkTileTarget(env: Env, t: TileTarget, path: string): void {
  switch (t.kind) {
    case 'eventTile':
    case 'fromTile':
    case 'figureTile':
      checkTileRef(env, t, path);
      break;
    case 'neighborTiles':
      if (!hasAnchor(env.ctx)) err(env, 'contextMissing', path, { value: t.kind });
      break;
    case 'randomTile':
    case 'randomEmptyTile':
      randomForbidden(env, path);
      break;
    case 'tilesOfType':
      if (!TILE_TYPES.includes(t.tileType))
        err(env, 'unknownTileType', path, { value: t.tileType });
      break;
    case 'value': {
      const vt = exprType(env, t.expr, path);
      if (!assignable(vt, 'tileSet')) err(env, 'typeMismatch', path);
      break;
    }
  }
}

function inRange(
  env: Env,
  value: number,
  range: { min: number; max: number },
  code: string,
  path: string,
): void {
  if (!Number.isInteger(value) || value < range.min || value > range.max) {
    err(env, code, path, { min: range.min, max: range.max });
  }
}

function checkAmount(env: Env, amount: number, path: string): void {
  inRange(env, amount, { min: 1, max: L.maxAmountPerEffect }, 'amountRange', path);
}

function findEffect(env: Env, name: string): EffectDef | undefined {
  const n = name.toLowerCase();
  return env.effects.find((d) => d.name.toLowerCase() === n);
}

function checkEffect(env: Env, e: Effect, path: string): void {
  switch (e.kind) {
    case 'spawn':
      if (!env.npcTypes.some((n) => n.id === e.npcType)) {
        err(env, 'unknownNpcType', path, { value: e.npcType });
      }
      if (env.settings.npcs.maxOnBoard === 0 || env.settings.npcs.maxSpawnsPerRound === 0) {
        err(env, 'npcsDisabled', path);
      }
      checkTileTarget(env, e.at, path);
      break;
    case 'damage':
    case 'heal':
    case 'shield':
      checkTarget(env, e.target, path);
      checkAmount(env, e.amount, path);
      break;
    case 'skip':
      checkTarget(env, e.target, path);
      inRange(env, e.turns, { min: 1, max: L.maxSkipTurns }, 'skipRange', path);
      break;
    case 'moveMod':
      checkTarget(env, e.target, path);
      inRange(env, e.delta, L.moveDelta, 'deltaRange', path);
      if (e.delta === 0) err(env, 'deltaZero', path);
      inRange(env, e.rounds, L.statusRounds, 'roundsRange', path);
      break;
    case 'wheelMod':
      checkTarget(env, e.target, path);
      inRange(env, e.delta, L.wheelDelta, 'deltaRange', path);
      if (e.delta === 0) err(env, 'deltaZero', path);
      inRange(env, e.rounds, L.statusRounds, 'roundsRange', path);
      break;
    case 'teleport':
      if (e.near) {
        pro(env, path);
        checkTileTarget(env, e.near, path);
      }
      randomForbidden(env, path);
      checkTarget(env, e.target, path);
      break;
    case 'push':
      checkTarget(env, e.target, path);
      checkTileTarget(env, e.from, path);
      inRange(env, e.distance, { min: 1, max: L.maxPush }, 'pushRange', path);
      break;
    case 'setTileType':
      checkTileTarget(env, e.at, path);
      if (!TILE_TYPES.includes(e.tileType))
        err(env, 'unknownTileType', path, { value: e.tileType });
      break;
    case 'removeTile':
    case 'addTileNear':
      checkTileTarget(env, e.at, path);
      break;
    case 'setVar':
      checkVarName(env, e.name, path);
      if (e.scope.kind === 'figures') checkTarget(env, e.scope.target, path);
      if (!['number', 'unknown'].includes(exprType(env, e.value, `${path}.value`))) {
        err(env, 'typeMismatch', path);
      }
      break;
    case 'message':
      if (e.text.trim().length === 0) err(env, 'messageEmpty', path);
      if (e.text.length > L.maxMessageLength) {
        err(env, 'messageTooLong', path, { max: L.maxMessageLength });
      }
      break;
    case 'code':
      // Playing a sound is a basic action (SPEC 5.7); other code in rules is Profi-Code.
      if (e.stmt.kind !== 'play') pro(env, path);
      checkStmt(env, e.stmt, path);
      break;
    case 'call': {
      const def = findEffect(env, e.effect);
      if (!def) {
        const isFunction = env.functions.some(
          (f) => f.name.toLowerCase() === e.effect.toLowerCase(),
        );
        err(env, isFunction ? 'functionNotEffect' : 'unknownEffect', path, { value: e.effect });
        e.args.forEach((a, i) => exprType(env, a, `${path}.args.${i}`));
        break;
      }
      if (e.args.length !== def.params.length) {
        err(env, 'argCount', path, { expected: def.params.length });
      }
      e.args.forEach((a, i) => {
        const at = exprType(env, a, `${path}.args.${i}`);
        const param = def.params[i];
        if (param && !assignable(at, param.type)) {
          err(env, 'argType', path, { param: param.name });
        }
      });
      break;
    }
  }
}

/** Validates a rule against the settings of the running game. Empty array = valid. */
export function validateRule(
  rule: RuleAST,
  settings: Settings,
  npcTypes: readonly NpcType[],
  effects: readonly EffectDef[] = [],
  functions: readonly FunctionDef[] = [],
): ValidationError[] {
  const env = newEnv(TRIGGER_CONTEXT[rule.trigger.kind], settings, npcTypes, effects, functions);
  if (rule.trigger.kind === 'custom') {
    pro(env, 'trigger');
    checkEventName(env, rule.trigger.event, 'trigger');
  }
  const name = rule.name.trim();
  if (name.length === 0) err(env, 'nameMissing', 'name');
  if (name.length > L.maxNameLength) err(env, 'nameTooLong', 'name', { max: L.maxNameLength });
  if (rule.trigger.kind === 'everyNRounds') {
    inRange(env, rule.trigger.n, L.everyNRounds, 'everyNRange', 'trigger');
  }
  if (rule.conditions.length > L.maxConditions) {
    err(env, 'tooManyConditions', 'conditions', { max: L.maxConditions });
  }
  rule.conditions.forEach((c, i) => expectBool(env, c, `conditions.${i}`));
  if (rule.effects.length === 0) err(env, 'noEffects', 'effects');
  if (rule.effects.length > L.maxEffects)
    err(env, 'tooManyEffects', 'effects', { max: L.maxEffects });
  if (rule.elseEffects.length > L.maxElseEffects) {
    err(env, 'tooManyEffects', 'elseEffects', { max: L.maxElseEffects });
  }
  if (rule.elseEffects.length > 0 && rule.conditions.length === 0) {
    err(env, 'elseWithoutCondition', 'elseEffects');
  }
  rule.effects.forEach((e, i) => checkEffect(env, e, `effects.${i}`));
  rule.elseEffects.forEach((e, i) => checkEffect(env, e, `elseEffects.${i}`));
  if (rule.duration !== null) inRange(env, rule.duration, L.duration, 'durationRange', 'duration');
  if (rule.limit) inRange(env, rule.limit.count, L.limitCount, 'limitRange', 'limit');
  return env.errors;
}

// ---------- own effects ----------

const ELEMENT: Partial<Record<ValueType, ValueType>> = {
  figureSet: 'figure',
  tileSet: 'tile',
};

function countStmts(stmts: Stmt[], depth: number, stats: { count: number; nesting: number }): void {
  stats.nesting = Math.max(stats.nesting, depth);
  for (const s of stmts) {
    stats.count++;
    if (s.kind === 'if') {
      countStmts(s.then, depth + 1, stats);
      countStmts(s.else, depth + 1, stats);
    } else if (
      s.kind === 'repeat' ||
      s.kind === 'forEach' ||
      s.kind === 'while' ||
      s.kind === 'after'
    ) {
      countStmts(s.body, depth + 1, stats);
    }
  }
}

const EVENT_NAME = /^[a-z0-9_äöüß]+$/;

function checkEventName(env: Env, name: string, path: string): void {
  if (!EVENT_NAME.test(name) || name.length > CL.maxEventName) {
    err(env, 'eventName', path, { max: CL.maxEventName });
  }
}

/** Statements that change the world (not allowed in functions). */
const WORLD_STMTS = new Set<Stmt['kind']>([
  'do',
  'play',
  'texture',
  'wait',
  'send',
  'after',
  'say',
]);

/** Checks size and nesting of a body; Profi-Code may be larger than block effects. */
function checkSize(env: Env, body: Stmt[], path: string, code: boolean): void {
  const stats = { count: 0, nesting: 0 };
  countStmts(body, 1, stats);
  const maxStmts = code ? CL.maxStmts : EL.maxStmts;
  const maxNesting = code ? CL.maxNesting : EL.maxNesting;
  if (stats.count > maxStmts) err(env, 'tooManySteps', path, { max: maxStmts });
  if (stats.nesting > maxNesting) err(env, 'tooDeep', path, { max: maxNesting });
}

function checkStmts(env: Env, stmts: Stmt[], path: string): void {
  stmts.forEach((s, i) => checkStmt(env, s, `${path}.${i}`));
}

function declare(env: Env, name: string, type: T, path: string): void {
  checkVarName(env, name, path);
  if (type === 'none') {
    env.scope.set(name.toLowerCase(), 'figure');
    return;
  }
  if (type === 'bool' && !env.pro) {
    // Block effects have no boolean variables; Profi-Code may store conditions.
    err(env, 'typeMismatch', path);
    env.scope.set(name.toLowerCase(), 'number');
    return;
  }
  // A variable that already had another type keeps working with any value.
  const before = env.scope.get(name.toLowerCase());
  env.scope.set(name.toLowerCase(), before && before !== type ? 'unknown' : type);
}

function checkStmt(env: Env, s: Stmt, path: string): void {
  const outer = env.line;
  if (s.line !== undefined) env.line = s.line;
  try {
    checkStmtInner(env, s, path);
  } finally {
    env.line = outer;
  }
}

function checkStmtInner(env: Env, s: Stmt, path: string): void {
  if (env.pure && WORLD_STMTS.has(s.kind)) {
    err(env, 'worldChangeInFunction', path);
    return;
  }
  switch (s.kind) {
    case 'do':
      checkEffect(env, s.effect, path);
      break;
    case 'if': {
      expectBool(env, s.cond, `${path}.cond`);
      const saved = new Map(env.scope);
      checkStmts(env, s.then, `${path}.then`);
      env.scope = new Map(saved);
      checkStmts(env, s.else, `${path}.else`);
      env.scope = saved;
      break;
    }
    case 'repeat': {
      if (!['number', 'unknown'].includes(exprType(env, s.times, `${path}.times`))) {
        err(env, 'typeMismatch', path);
      }
      if (s.times.kind === 'num') {
        inRange(env, s.times.value, { min: 1, max: EL.maxRepeat }, 'repeatRange', path);
      }
      checkStmts(env, s.body, `${path}.body`);
      break;
    }
    case 'forEach': {
      const t = exprType(env, s.in, `${path}.in`);
      const element = t === 'unknown' || t === 'list' ? 'unknown' : ELEMENT[t as ValueType];
      if (!element) err(env, 'notASet', path);
      const saved = new Map(env.scope);
      declare(env, s.var, element ?? 'unknown', path);
      checkStmts(env, s.body, `${path}.body`);
      env.scope = saved;
      break;
    }
    case 'pick': {
      randomForbidden(env, path);
      const t = exprType(env, s.from, `${path}.from`);
      const element = t === 'unknown' || t === 'list' ? 'unknown' : ELEMENT[t as ValueType];
      if (!element) err(env, 'notASet', path);
      declare(env, s.var, element ?? 'unknown', path);
      break;
    }
    case 'let':
      declare(env, s.name, exprType(env, s.value, `${path}.value`), path);
      break;
    case 'play':
      if (!assignable(exprType(env, s.sound, path), 'sound')) err(env, 'typeMismatch', path);
      break;
    case 'texture':
      if (!assignable(exprType(env, s.tile, path), 'tileSet')) err(env, 'typeMismatch', path);
      if (!assignable(exprType(env, s.name, path), 'texture')) err(env, 'typeMismatch', path);
      break;
    case 'wait':
      if (!(s.seconds >= 0 && s.seconds <= EL.maxWait)) {
        err(env, 'waitRange', path, { max: EL.maxWait });
      }
      break;
    case 'while': {
      pro(env, path);
      expectBool(env, s.cond, `${path}.cond`);
      const saved = new Map(env.scope);
      checkStmts(env, s.body, `${path}.body`);
      env.scope = saved;
      break;
    }
    case 'return':
      pro(env, path);
      if (!env.pure) err(env, 'returnOutsideFunction', path);
      exprType(env, s.value, `${path}.value`);
      break;
    case 'send':
      pro(env, path);
      checkEventName(env, s.event, path);
      break;
    case 'after': {
      pro(env, path);
      inRange(env, s.rounds, CL.delayRounds, 'delayRange', path);
      const saved = new Map(env.scope);
      checkStmts(env, s.body, `${path}.body`);
      env.scope = saved;
      break;
    }
    case 'listAdd': {
      pro(env, path);
      const t = env.scope.get(s.list.toLowerCase());
      if (!t) err(env, 'unknownVariable', path, { value: s.list });
      else if (t !== 'list' && t !== 'unknown') err(env, 'notAList', path, { value: s.list });
      exprType(env, s.value, `${path}.value`);
      break;
    }
    case 'say': {
      pro(env, path);
      const t = exprType(env, s.text, `${path}.text`);
      if (t !== 'text' && t !== 'number' && t !== 'unknown') err(env, 'typeMismatch', path);
      break;
    }
  }
}

const PARAM_TYPES: readonly ParamType[] = [
  'number',
  'text',
  'figure',
  'tile',
  'figureSet',
  'tileSet',
  'npcType',
  'texture',
  'sound',
];

/** Validates an own effect from the effect workshop. */
export function validateEffect(
  def: EffectDef,
  settings: Settings,
  npcTypes: readonly NpcType[],
  effects: readonly EffectDef[],
  functions: readonly FunctionDef[] = [],
): ValidationError[] {
  const env = newEnv(EFFECT_CONTEXT, settings, npcTypes, effects, functions, { inEffect: true });
  if (!EFFECT_NAME.test(def.name) || def.name.length > 30) err(env, 'effectName', 'name');
  if ([...def.symbol].length > 2) err(env, 'symbolTooLong', 'symbol');
  if (def.params.length > EL.maxParams) err(env, 'tooManyParams', 'params', { max: EL.maxParams });
  const seen = new Set<string>();
  def.params.forEach((p, i) => {
    const n = p.name.toLowerCase();
    if (seen.has(n)) err(env, 'duplicateParam', `params.${i}`, { value: p.name });
    seen.add(n);
    if (!PARAM_TYPES.includes(p.type)) err(env, 'paramType', `params.${i}`);
    checkVarName(env, p.name, `params.${i}`);
    env.scope.set(n, p.type);
  });
  if (def.body.length === 0) err(env, 'emptyBody', 'body');
  checkStmts(env, def.body, 'body');
  checkSize(env, def.body, 'body', env.pro);
  return env.errors;
}

const NO_CONTEXT: TriggerContext = {
  figures: [],
  eventTile: false,
  fromTile: false,
  amount: false,
};

/** Validates an own function: computes a value, never changes the world (SPEC 5.8). */
export function validateFunction(
  def: FunctionDef,
  settings: Settings,
  functions: readonly FunctionDef[],
): ValidationError[] {
  const env = newEnv(NO_CONTEXT, settings, [], [], functions, { pure: true });
  pro(env, 'name');
  if (!EFFECT_NAME.test(def.name) || def.name.length > 30) err(env, 'effectName', 'name');
  // Names of queries (anzahl, entfernung …) stay queries.
  if (lookup(QUERY_W, def.name)) err(env, 'effectName', 'name');
  if (def.params.length > EL.maxParams) err(env, 'tooManyParams', 'params', { max: EL.maxParams });
  const seen = new Set<string>();
  def.params.forEach((p, i) => {
    const n = p.toLowerCase();
    if (seen.has(n)) err(env, 'duplicateParam', `params.${i}`, { value: p });
    seen.add(n);
    checkVarName(env, p, `params.${i}`);
    env.scope.set(n, 'unknown');
  });
  if (def.body.length === 0) err(env, 'emptyBody', 'body');
  checkSize(env, def.body, 'body', true);
  checkStmts(env, def.body, 'body');
  return env.errors;
}

/** Finds the NPC type an NPC "…" ZUG block belongs to (by id or name). */
export function npcTypeFor(code: NpcCode, npcTypes: readonly NpcType[]): NpcType | undefined {
  const n = code.npc.toLowerCase();
  return npcTypes.find((t) => t.id === n || t.name.toLowerCase() === n);
}

/** Validates NPC "…" ZUG: own behavior of an NPC type (SPEC 5.8). */
export function validateNpcCode(
  code: NpcCode,
  settings: Settings,
  npcTypes: readonly NpcType[],
  effects: readonly EffectDef[],
  functions: readonly FunctionDef[],
): ValidationError[] {
  const ctx: TriggerContext = { figures: [], eventTile: true, fromTile: false, amount: false };
  const env = newEnv(ctx, settings, npcTypes, effects, functions, { self: true, inEffect: true });
  pro(env, 'npc');
  if (!npcTypeFor(code, npcTypes)) err(env, 'unknownNpcType', 'npc', { value: code.npc });
  if (code.body.length === 0) err(env, 'emptyBody', 'body');
  checkSize(env, code.body, 'body', true);
  checkStmts(env, code.body, 'body');
  return env.errors;
}

/** Does an effect body use Profi-Code (shown as a grey code block in the block view)? */
export function usesProCode(def: EffectDef): boolean {
  const env = newEnv(EFFECT_CONTEXT, DEFAULT_SETTINGS, [], [], [], { inEffect: true });
  def.params.forEach((p) => env.scope.set(p.name.toLowerCase(), p.type));
  checkStmts(env, def.body, 'body');
  return env.pro;
}

/** Type of an expression inside an effect body (for the block editor). */
export function inferType(e: Expr, scope: ReadonlyMap<string, ValueType>): T {
  const env = newEnv(EFFECT_CONTEXT, DEFAULT_SETTINGS, [], [], [], {
    inEffect: true,
    scope: new Map(scope),
  });
  return exprType(env, e, '');
}

export type InferredType = T;
