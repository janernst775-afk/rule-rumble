// Small helpers to write rule ASTs in TypeScript (start library, tests).
// The text language with parser and printer follows in v0.4.
import type { TileType } from '../engine/types';
import type {
  CmpOp,
  Effect,
  Expr,
  FigureRef,
  RuleAST,
  RuleLimit,
  Target,
  TileRef,
  TileTarget,
  Trigger,
} from './ast';

export const on = {
  roundStart: (): Trigger => ({ kind: 'roundStart' }),
  roundEnd: (): Trigger => ({ kind: 'roundEnd' }),
  everyNRounds: (n: number): Trigger => ({ kind: 'everyNRounds', n }),
  turnStart: (): Trigger => ({ kind: 'turnStart' }),
  turnEnd: (): Trigger => ({ kind: 'turnEnd' }),
  enters: (newOnly = false): Trigger => ({ kind: 'enters', newOnly }),
  leaves: (): Trigger => ({ kind: 'leaves' }),
  attack: (): Trigger => ({ kind: 'attack' }),
  hit: (): Trigger => ({ kind: 'hit' }),
  miss: (): Trigger => ({ kind: 'miss' }),
  damage: (): Trigger => ({ kind: 'damage' }),
  dies: (): Trigger => ({ kind: 'dies' }),
  tileAdded: (): Trigger => ({ kind: 'tileAdded' }),
  tileRemoved: (): Trigger => ({ kind: 'tileRemoved' }),
};

export const who = {
  trigger: { kind: 'ref', ref: 'trigger' } as Target,
  attacker: { kind: 'ref', ref: 'attacker' } as Target,
  target: { kind: 'ref', ref: 'target' } as Target,
  onTile: { kind: 'onTile' } as Target,
  neighbors: { kind: 'neighbors' } as Target,
  nearest: { kind: 'nearest' } as Target,
  random: { kind: 'random' } as Target,
  all: { kind: 'all' } as Target,
  allNpcs: { kind: 'allNpcs' } as Target,
};

export const where = {
  tile: { kind: 'eventTile' } as TileRef,
  fromTile: { kind: 'fromTile' } as TileRef,
  of: (ref: FigureRef): TileRef => ({ kind: 'figureTile', ref }),
  neighborTiles: { kind: 'neighborTiles' } as TileTarget,
  randomTile: { kind: 'randomTile' } as TileTarget,
  randomEmptyTile: { kind: 'randomEmptyTile' } as TileTarget,
  ofType: (tileType: TileType): TileTarget => ({ kind: 'tilesOfType', tileType }),
};

export const x = {
  num: (value: number): Expr => ({ kind: 'num', value }),
  str: (value: string): Expr => ({ kind: 'str', value }),
  hp: (ref: FigureRef): Expr => ({ kind: 'figureProp', ref, prop: 'hp' }),
  move: (ref: FigureRef): Expr => ({ kind: 'figureProp', ref, prop: 'move' }),
  figVar: (ref: FigureRef, name: string): Expr => ({ kind: 'figureVar', ref, name }),
  tileType: (tile: TileRef = where.tile): Expr => ({ kind: 'tileProp', tile, prop: 'type' }),
  tileTexture: (tile: TileRef = where.tile): Expr => ({ kind: 'tileProp', tile, prop: 'texture' }),
  tileFigures: (tile: TileRef = where.tile): Expr => ({
    kind: 'tileProp',
    tile,
    prop: 'figureCount',
  }),
  round: { kind: 'global', name: 'round' } as Expr,
  tileCount: { kind: 'global', name: 'tileCount' } as Expr,
  npcCount: { kind: 'global', name: 'npcCount' } as Expr,
  world: (name: string): Expr => ({ kind: 'worldVar', name }),
  amount: { kind: 'amount' } as Expr,
  cmp: (left: Expr, op: CmpOp, right: Expr): Expr => ({ kind: 'cmp', op, left, right }),
  chance: (percent: number): Expr => ({ kind: 'chance', percent }),
  and: (...items: Expr[]): Expr => ({ kind: 'and', items }),
  or: (...items: Expr[]): Expr => ({ kind: 'or', items }),
  not: (item: Expr): Expr => ({ kind: 'not', item }),
};

export const fx = {
  spawn: (npcType: string, at: TileTarget = where.tile): Effect => ({ kind: 'spawn', npcType, at }),
  damage: (target: Target): Effect => ({ kind: 'damage', target, amount: 1 }),
  heal: (target: Target): Effect => ({ kind: 'heal', target, amount: 1 }),
  move: (target: Target, delta: number, rounds: number): Effect => ({
    kind: 'moveMod',
    target,
    delta,
    rounds,
  }),
  wheel: (target: Target, delta: number, rounds: number): Effect => ({
    kind: 'wheelMod',
    target,
    delta,
    rounds,
  }),
  teleport: (target: Target): Effect => ({ kind: 'teleport', target }),
  push: (target: Target, from: TileTarget): Effect => ({ kind: 'push', target, from, distance: 1 }),
  skip: (target: Target): Effect => ({ kind: 'skip', target, turns: 1 }),
  shield: (target: Target): Effect => ({ kind: 'shield', target, amount: 1 }),
  tileType: (at: TileTarget, tileType: TileType): Effect => ({ kind: 'setTileType', at, tileType }),
  removeTile: (at: TileTarget): Effect => ({ kind: 'removeTile', at }),
  addTileNear: (at: TileTarget): Effect => ({ kind: 'addTileNear', at }),
  setVar: (target: Target, name: string, op: '=' | '+' | '-', value: Expr): Effect => ({
    kind: 'setVar',
    scope: { kind: 'figures', target },
    name,
    op,
    value,
  }),
  setWorld: (name: string, op: '=' | '+' | '-', value: Expr): Effect => ({
    kind: 'setVar',
    scope: { kind: 'world' },
    name,
    op,
    value,
  }),
  say: (text: string): Effect => ({ kind: 'message', text }),
};

export function rule(
  name: string,
  trigger: Trigger,
  parts: {
    when?: Expr[];
    then: Effect[];
    otherwise?: Effect[];
    duration?: number;
    limit?: RuleLimit;
  },
): RuleAST {
  return {
    name,
    trigger,
    conditions: parts.when ?? [],
    effects: parts.then,
    elseEffects: parts.otherwise ?? [],
    duration: parts.duration ?? null,
    limit: parts.limit ?? null,
  };
}
