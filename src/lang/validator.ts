// Rule validator (SPEC 5.6): types, context values per trigger, limits (SPEC 6),
// "rules are the same for everyone" and the settings of the running game.
import { RULE_LIMITS as L } from '../engine/limits';
import type { NpcType, Settings, TileType } from '../engine/types';
import type { Effect, Expr, FigureRef, RuleAST, Target, TileRef, TileTarget } from './ast';
import { hasAnchor, TRIGGER_CONTEXT, type TriggerContext } from './context';

export interface ValidationError {
  /** i18n key suffix: validation.<code> */
  code: string;
  /** Location in the rule, e.g. "effects.1" or "conditions.0". */
  path: string;
  params?: Record<string, string | number>;
}

export const TILE_TYPES: readonly TileType[] = ['normal', 'lava', 'eis', 'heilquelle', 'falle'];

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

type ExprType = 'number' | 'string' | 'bool';

interface Env {
  ctx: TriggerContext;
  settings: Settings;
  npcTypes: readonly NpcType[];
  errors: ValidationError[];
}

function err(env: Env, code: string, path: string, params?: ValidationError['params']): void {
  env.errors.push(params ? { code, path, params } : { code, path });
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

function exprType(env: Env, e: Expr, path: string): ExprType {
  switch (e.kind) {
    case 'num':
      if (!Number.isFinite(e.value) || Math.abs(e.value) > L.variable.max) {
        err(env, 'numberRange', path, { min: L.variable.min, max: L.variable.max });
      }
      return 'number';
    case 'str':
      return 'string';
    case 'figureProp':
      checkFigureRef(env, e.ref, path);
      return 'number';
    case 'figureVar':
      checkFigureRef(env, e.ref, path);
      checkVarName(env, e.name, path);
      return 'number';
    case 'tileProp':
      checkTileRef(env, e.tile, path);
      return e.prop === 'figureCount' ? 'number' : 'string';
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
      if (lt === 'bool' || rt === 'bool' || lt !== rt) {
        err(env, 'typeMismatch', path);
      } else if (lt === 'string' && e.op !== '=' && e.op !== '!=') {
        err(env, 'stringCompare', path);
      }
      // Tile types must be known names.
      const pair = [e.left, e.right];
      const typeSide = pair.find((x) => x.kind === 'tileProp' && x.prop === 'type');
      const strSide = pair.find((x) => x.kind === 'str');
      if (typeSide && strSide?.kind === 'str' && !TILE_TYPES.includes(strSide.value as TileType)) {
        err(env, 'unknownTileType', path, { value: strSide.value });
      }
      return 'bool';
    }
  }
}

function expectBool(env: Env, e: Expr, path: string): void {
  if (exprType(env, e, path) !== 'bool') err(env, 'notACondition', path);
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
      if (exprType(env, e.value, `${path}.value`) !== 'number') err(env, 'typeMismatch', path);
      break;
    case 'message':
      if (e.text.trim().length === 0) err(env, 'messageEmpty', path);
      if (e.text.length > L.maxMessageLength) {
        err(env, 'messageTooLong', path, { max: L.maxMessageLength });
      }
      break;
  }
}

/** Validates a rule against the settings of the running game. Empty array = valid. */
export function validateRule(
  rule: RuleAST,
  settings: Settings,
  npcTypes: readonly NpcType[],
): ValidationError[] {
  const env: Env = { ctx: TRIGGER_CONTEXT[rule.trigger.kind], settings, npcTypes, errors: [] };
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
