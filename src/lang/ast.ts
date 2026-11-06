// One AST for every way of writing rules (CLAUDE.md rule 7). Identifiers are English;
// German keywords and their English aliases live only in lang/keywords.ts (v0.4).
import type { TileType } from '../engine/types';

/** Figures an event can name. None of them is a role, a name or "the author" (SPEC 6.1). */
export type FigureRef = 'trigger' | 'attacker' | 'target';

export type TriggerKind =
  | 'roundStart'
  | 'roundEnd'
  | 'everyNRounds'
  | 'turnStart'
  | 'turnEnd'
  | 'enters'
  | 'leaves'
  | 'attack'
  | 'hit'
  | 'miss'
  | 'damage'
  | 'dies'
  | 'tileAdded'
  | 'tileRemoved';

export type Trigger =
  | { kind: Exclude<TriggerKind, 'everyNRounds' | 'enters'> }
  | { kind: 'everyNRounds'; n: number }
  /** BETRITT feld / BETRITT neues_feld */
  | { kind: 'enters'; newOnly: boolean };

/** Tiles relative to the event. */
export type TileRef =
  | { kind: 'eventTile' }
  /** von_feld: the tile a figure came from (enters/leaves). */
  | { kind: 'fromTile' }
  /** e.g. angreifer.feld */
  | { kind: 'figureTile'; ref: FigureRef };

export type FigureProp = 'hp' | 'maxHp' | 'move' | 'wheelChance' | 'shield';
export type TileProp = 'type' | 'figureCount' | 'texture';
export type GlobalName = 'round' | 'tileCount' | 'npcCount';

export type Expr =
  | { kind: 'num'; value: number }
  | { kind: 'str'; value: string }
  | { kind: 'figureProp'; ref: FigureRef; prop: FigureProp }
  | { kind: 'figureVar'; ref: FigureRef; name: string }
  | { kind: 'tileProp'; tile: TileRef; prop: TileProp }
  | { kind: 'global'; name: GlobalName }
  | { kind: 'worldVar'; name: string }
  /** menge (SCHADEN trigger) */
  | { kind: 'amount' }
  | { kind: 'cmp'; op: CmpOp; left: Expr; right: Expr }
  | { kind: 'and'; items: Expr[] }
  | { kind: 'or'; items: Expr[] }
  | { kind: 'not'; item: Expr }
  | { kind: 'chance'; percent: number };

export type CmpOp = '=' | '!=' | '<' | '>' | '<=' | '>=';

/** Figure targets (SPEC 5.2 "Ziele"). Always relative to the event. */
export type Target =
  | { kind: 'ref'; ref: FigureRef }
  /** alle_auf_feld */
  | { kind: 'onTile' }
  /** nachbarn: figures on orthogonally adjacent tiles */
  | { kind: 'neighbors' }
  | { kind: 'nearest' }
  | { kind: 'random' }
  | { kind: 'all' }
  | { kind: 'allNpcs' };

/** Tile targets (SPEC 5.2 "Feld-Ziele"). */
export type TileTarget =
  | TileRef
  | { kind: 'neighborTiles' }
  | { kind: 'randomTile' }
  | { kind: 'randomEmptyTile' }
  | { kind: 'tilesOfType'; tileType: TileType };

export type VarScope = { kind: 'figures'; target: Target } | { kind: 'world' };

export type Effect =
  | { kind: 'spawn'; npcType: string; at: TileTarget }
  | { kind: 'damage'; target: Target; amount: number }
  | { kind: 'heal'; target: Target; amount: number }
  | { kind: 'moveMod'; target: Target; delta: number; rounds: number }
  | { kind: 'teleport'; target: Target }
  | { kind: 'push'; target: Target; from: TileTarget; distance: number }
  | { kind: 'skip'; target: Target; turns: number }
  | { kind: 'shield'; target: Target; amount: number }
  | { kind: 'setTileType'; at: TileTarget; tileType: Exclude<TileType, 'normal'> | 'normal' }
  | { kind: 'removeTile'; at: TileTarget }
  | { kind: 'addTileNear'; at: TileTarget }
  | { kind: 'wheelMod'; target: Target; delta: number; rounds: number }
  | { kind: 'setVar'; scope: VarScope; name: string; op: '=' | '+' | '-'; value: Expr }
  | { kind: 'message'; text: string };

export type EffectKind = Effect['kind'];

export interface RuleLimit {
  count: number;
  per: 'round' | 'turn' | 'game';
}

export interface RuleAST {
  name: string;
  trigger: Trigger;
  /** All must hold (implicit UND between lines). */
  conditions: Expr[];
  /** DANN: 1 to 3 effects */
  effects: Effect[];
  /** SONST: 0 to 3 effects, run when the conditions do not hold */
  elseEffects: Effect[];
  /** DAUER in rounds; null = until the end of the game */
  duration: number | null;
  limit: RuleLimit | null;
}

/** A rule as stored in the library and carried by the addRule action. */
export interface RuleDefinition {
  /** Stable library id, e.g. "start.zombie-land" or a generated id for own rules. */
  id: string;
  /** Name of the player who wrote it (display only, never readable by rules). */
  author: string;
  ast: RuleAST;
}
