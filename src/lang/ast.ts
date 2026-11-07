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
  | 'tileRemoved'
  /** WENN EREIGNIS "name" (Profi-Code, SPEC 5.8) */
  | 'custom';

export type Trigger =
  | { kind: Exclude<TriggerKind, 'everyNRounds' | 'enters' | 'custom'> }
  | { kind: 'custom'; event: string }
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
  | { kind: 'chance'; percent: number }
  // ---- effect workshop (SPEC 5.7) ----
  /** Parameter or local variable (MERKE, FÜR JEDE, WÄHLE ZUFÄLLIG). */
  | { kind: 'var'; name: string }
  /** Property of a variable: f.leben, f.feld, f.typ, f.anzahl_figuren, f.<eigene Variable> */
  | { kind: 'varProp'; name: string; prop: string }
  | { kind: 'query'; name: QueryName; args: Expr[] }
  /** A figure named by the event (argument of an effect call in a rule). */
  | { kind: 'figureRef'; ref: FigureRef }
  /** A tile named by the event; inside effects `feld` is always available. */
  | { kind: 'tileRef'; tile: TileRef }
  /** A set of figures as in rule targets (alle, nachbarn …). */
  | { kind: 'targets'; target: Target }
  /** A set of tiles as in rule tile targets (nachbarfelder …). */
  | { kind: 'tiles'; target: TileTarget }
  /** KEINE (no figure / no tile) */
  | { kind: 'none' }
  // ---- Profi-Code (SPEC 5.8) ----
  /** + - * / ; `+` also joins texts */
  | { kind: 'arith'; op: ArithOp; left: Expr; right: Expr }
  /** [1, 2, 3] */
  | { kind: 'list'; items: Expr[] }
  /** Call of an own function: schwächste(alle_figuren) */
  | { kind: 'fcall'; name: string; args: Expr[] }
  /** selbst: the NPC whose turn it is (NPC "…" ZUG) */
  | { kind: 'self' }
  /** Property of any value: selbst.feld, schwächste(m).leben, liste.länge */
  | { kind: 'prop'; of: Expr; prop: string };

export type ArithOp = '+' | '-' | '*' | '/';

/** Queries of the effect workshop (SPEC 5.7 "Abfragen"). */
export type QueryName =
  | 'figuresOn'
  | 'neighborTiles'
  | 'tilesOfType'
  | 'tilesWithTexture'
  | 'emptyTiles'
  | 'allFigures'
  | 'allNpcs'
  | 'nearestFigure'
  | 'distance'
  | 'randomNumber'
  | 'count'
  /** felder_am_rand: tiles with fewer than four neighbors (SPEC 5.8 "Flut") */
  | 'edgeTiles';

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
  | { kind: 'allNpcs' }
  /** Inside effects: a figure or set of figures from a variable or query. */
  | { kind: 'value'; expr: Expr };

/** Tile targets (SPEC 5.2 "Feld-Ziele"). */
export type TileTarget =
  | TileRef
  | { kind: 'neighborTiles' }
  | { kind: 'randomTile' }
  | { kind: 'randomEmptyTile' }
  | { kind: 'tilesOfType'; tileType: TileType }
  /** Inside effects: a tile or set of tiles from a variable or query. */
  | { kind: 'value'; expr: Expr };

export type VarScope = { kind: 'figures'; target: Target } | { kind: 'world' };

export type Effect =
  | { kind: 'spawn'; npcType: string; at: TileTarget }
  | { kind: 'damage'; target: Target; amount: number }
  | { kind: 'heal'; target: Target; amount: number }
  | { kind: 'moveMod'; target: Target; delta: number; rounds: number }
  /** TELEPORT ziel ZUFÄLLIG, or TELEPORT ziel NEBEN feld (a free tile next to it) */
  | { kind: 'teleport'; target: Target; near?: TileTarget }
  | { kind: 'push'; target: Target; from: TileTarget; distance: number }
  | { kind: 'skip'; target: Target; turns: number }
  | { kind: 'shield'; target: Target; amount: number }
  | { kind: 'setTileType'; at: TileTarget; tileType: Exclude<TileType, 'normal'> | 'normal' }
  | { kind: 'removeTile'; at: TileTarget }
  | { kind: 'addTileNear'; at: TileTarget }
  | { kind: 'wheelMod'; target: Target; delta: number; rounds: number }
  | { kind: 'setVar'; scope: VarScope; name: string; op: '=' | '+' | '-'; value: Expr }
  | { kind: 'message'; text: string }
  /** Calls an own effect from the effect workshop by name: Erdbeben(1) */
  | { kind: 'call'; effect: string; args: Expr[] }
  /** Profi-Code in a rule: DANN WENN … ENDE, DANN SENDE "x", … (one statement) */
  | { kind: 'code'; stmt: Stmt };

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

// ---------- effect workshop (SPEC 5.7) ----------

/** Parameter and value types. Sets are typed by their elements. */
export type ValueType =
  | 'number'
  | 'text'
  | 'bool'
  | 'figure'
  | 'tile'
  | 'figureSet'
  | 'tileSet'
  | 'npcType'
  | 'texture'
  | 'sound'
  /** Profi-Code lists [1, 2, 3] */
  | 'list';

export type ParamType = Exclude<ValueType, 'bool' | 'list'>;

export interface EffectParam {
  name: string;
  type: ParamType;
}

export type Stmt =
  /** A primitive (all effects from SPEC 5.2) or a call of another own effect. */
  (
    | { kind: 'do'; effect: Effect }
    | { kind: 'if'; cond: Expr; then: Stmt[]; else: Stmt[] }
    /** WIEDERHOLE n MAL (max. 10) */
    | { kind: 'repeat'; times: Expr; body: Stmt[] }
    /** FÜR JEDE x IN menge (max. 200 Elemente) */
    | { kind: 'forEach'; var: string; in: Expr; body: Stmt[] }
    /** WÄHLE ZUFÄLLIG x AUS menge */
    | { kind: 'pick'; var: string; from: Expr }
    /** MERKE x = … (local variable) */
    | { kind: 'let'; name: string; value: Expr }
    /** SPIELE "sound" (audible from v0.7) */
    | { kind: 'play'; sound: Expr }
    /** TEXTUR feld "Name" */
    | { kind: 'texture'; tile: Expr; name: Expr }
    /** WARTE 0.5 (animation only, no game effect) */
    | { kind: 'wait'; seconds: number }
    // ---- Profi-Code (SPEC 5.8) ----
    /** SOLANGE bedingung … ENDE (the step budget stops endless loops) */
    | { kind: 'while'; cond: Expr; body: Stmt[] }
    /** GIB ZURÜCK wert (functions only) */
    | { kind: 'return'; value: Expr }
    /** SENDE "name": raises the own event WENN EREIGNIS "name" */
    | { kind: 'send'; event: string }
    /** NACH n RUNDEN … ENDE: runs the body at the start of round + n */
    | { kind: 'after'; rounds: number; body: Stmt[] }
    /** liste.füge_hinzu(x) */
    | { kind: 'listAdd'; list: string; value: Expr }
    /** ZEIGE with a computed text, e.g. ZEIGE "Flut: " + welt.flut */
    | { kind: 'say'; text: Expr }
  ) & {
    /** Source line (code view only; used by the debugger and error messages). */
    line?: number;
  };

export type StmtKind = Stmt['kind'];

/** An own effect from the effect workshop. */
export interface EffectDef {
  /** Unique (case-insensitive) name; rules call effects by name. */
  name: string;
  author: string;
  /** Short symbol (1–2 characters) shown on blocks. */
  symbol: string;
  params: EffectParam[];
  body: Stmt[];
}

/** An own function (Profi-Code): computes a value, never changes the world. */
export interface FunctionDef {
  name: string;
  author: string;
  params: string[];
  body: Stmt[];
}

/** NPC "Geist" ZUG … ENDE: replaces the movement template of an NPC type. */
export interface NpcCode {
  /** Name or id of the NPC type as written. */
  npc: string;
  body: Stmt[];
}

/** Everything a code text defines (SPEC 5.8). */
export interface ProgramAST {
  rules: RuleAST[];
  effects: EffectDef[];
  functions: FunctionDef[];
  npcCode: NpcCode[];
}

/** Own effects, functions and NPC types a rule needs, carried along into the game. */
export interface RuleBundle {
  effects: EffectDef[];
  npcTypes: import('../engine/types').NpcType[];
  /** Own functions (Profi-Code); missing in bundles from v0.5. */
  functions?: FunctionDef[];
}

/** Runtime values of the effect language (plain JSON, so they fit into GameState). */
export type RuntimeValue =
  | number
  | string
  | boolean
  | null
  | { t: 'fig'; id: string }
  | { t: 'tile'; pos: { x: number; y: number } }
  | { t: 'figs'; ids: string[] }
  | { t: 'tiles'; pos: { x: number; y: number }[] }
  | { t: 'list'; items: RuntimeValue[] };

/** A rule as stored in the library and carried by the addRule action. */
export interface RuleDefinition {
  /** Stable library id, e.g. "start.zombie-land" or a generated id for own rules. */
  id: string;
  /** Name of the player who wrote it (display only, never readable by rules). */
  author: string;
  ast: RuleAST;
  /** Own effects and NPC types used by the rule (resolved from the library). */
  bundle?: RuleBundle;
}
