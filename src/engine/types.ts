// Core engine types. Everything here is plain JSON: no classes, Maps or functions.

export type Pos = { x: number; y: number };
/** Tile key in the form "x,y". */
export type TileKey = string;
export type FigureId = string;
/** Integer percentage 0–100 (avoids float drift in deterministic games). */
export type Percent = number;

export type BossHpSetting =
  { mode: 'perHero'; perHero: number; solo: number } | { mode: 'fixed'; value: number };

export type RuleOverflow = 'dropOldest' | 'authorChooses' | 'blockNew' | 'vote';
export type BotSpeed = 'fast' | 'normal' | 'slow';
export type Difficulty = 'easy' | 'normal' | 'hard';

export interface Settings {
  version: 1;
  rules: {
    /** null = unlimited */
    maxActive: number | null;
    overflow: RuleOverflow;
    /** Rounds until a new rule becomes active (0 = immediately). */
    activationDelay: 0 | 1 | 2;
    proCodeAllowed: boolean;
    ruleDamagePerFigurePerRound: number;
    allowRandom: boolean;
  };
  board: {
    /** Edge length of the square start board. */
    startSize: number;
    minTiles: number;
    maxTiles: number;
    customTextures: boolean;
    tileActionsPerAction: 1 | 2;
  };
  figures: {
    heroHp: number;
    bossHp: BossHpSetting;
    heroMove: number;
    bossMove: number;
  };
  combat: {
    wheelChance: Percent;
    /** Per-spin random spread: chance is drawn uniformly from wheelChance ± spread. */
    wheelChanceSpread: Percent;
    friendlyFire: boolean;
    comeback: boolean;
  };
  npcs: {
    maxOnBoard: number;
    maxSpawnsPerRound: number;
  };
  tempo: {
    /** null = unlimited */
    turnTimeSec: number | null;
    roundLimit: { rounds: number; outcome: 'boss' | 'draw' } | null;
  };
  bots: {
    speed: BotSpeed;
    /** Chance that a hero bot attacks another hero when possible. */
    heroChaos: Percent;
  };
}

export type TileType = 'normal' | 'lava' | 'eis' | 'heilquelle' | 'falle';

export interface Tile {
  pos: Pos;
  type: TileType;
  /** Texture library id (v0.2). */
  textureId: string | null;
  visitedBy: FigureId[];
}

export type Status =
  | { kind: 'shield'; remaining: number }
  | { kind: 'skip'; remaining: number }
  | { kind: 'moveMod'; delta: number; rounds: number }
  | { kind: 'wheelMod'; delta: Percent; rounds: number };

export type FigureKind = 'hero' | 'boss' | 'npc';

/**
 * Engine view of a figure. Name, avatar and controller live in `Participant`
 * so that rules (v0.3) can be given a Figure without leaking identity.
 * `kind` is engine-internal and must never be exposed to rules.
 */
export interface Figure {
  id: FigureId;
  kind: FigureKind;
  npcTypeId: string | null;
  pos: Pos;
  hp: number;
  maxHp: number;
  baseMove: number;
  vars: Record<string, number>;
  statuses: Status[];
  alive: boolean;
  joinedRound: number;
}

export type Controller = 'human' | 'bot' | 'npc';

export interface Avatar {
  /** Data URL (256×256) or null for colored initials. */
  image: string | null;
  color: string;
}

export interface Participant {
  figureId: FigureId;
  name: string;
  avatar: Avatar;
  controller: Controller;
  difficulty: Difficulty | null;
}

/** Placeholder for v0.3+ custom NPC types. */
export interface NpcType {
  id: string;
  name: string;
  hp: number;
  move: number;
  behavior: 'chase' | 'wander' | 'stand' | 'flee';
}

/** Placeholder for v0.3 active rules. */
export interface ActiveRule {
  id: string;
  ruleId: string;
  authorId: FigureId;
  activeFromRound: number;
  firedThisRound: number;
}

export interface FigureStats {
  attacks: number;
  hits: number;
  misses: number;
  damageDealt: number;
  damageTaken: number;
  tilesMoved: number;
  tilesAdded: number;
  tilesRemoved: number;
}

export type Winner = 'heroes' | 'boss' | 'draw';

export interface GameResult {
  winner: Winner;
  winners: FigureId[];
  reason: 'bossDied' | 'heroesDied' | 'simultaneous' | 'roundLimit';
}

export type Phase = 'move' | 'action';

export interface TurnState {
  order: FigureId[];
  index: number;
  phase: Phase;
  /** Tile actions already used this turn (Baumeister allows two). */
  tileActionsUsed: number;
}

export interface LogEntry {
  round: number;
  /** i18n key, e.g. "log.hit". */
  key: string;
  params: Record<string, string | number>;
}

export interface GameState {
  schemaVersion: 1;
  settings: Settings;
  seed: number;
  /** mulberry32 internal state */
  rng: number;
  round: number;
  turn: TurnState;
  status: 'playing' | 'over';
  tiles: Record<TileKey, Tile>;
  figures: Record<FigureId, Figure>;
  /** Heroes in seat order, then the boss. */
  seatOrder: FigureId[];
  participants: Record<FigureId, Participant>;
  npcTypes: NpcType[];
  rules: ActiveRule[];
  world: Record<string, number>;
  stats: Record<FigureId, FigureStats>;
  log: LogEntry[];
  result: GameResult | null;
  nextId: number;
}

export type Action =
  | { type: 'move'; actor: FigureId; path: Pos[] }
  | { type: 'attack'; actor: FigureId; target: FigureId }
  | { type: 'addTile'; actor: FigureId; pos: Pos; textureId: string | null }
  | { type: 'removeTile'; actor: FigureId; pos: Pos }
  | { type: 'addRule'; actor: FigureId; ruleId: string }
  | { type: 'pass'; actor: FigureId };

export type ActionType = Action['type'];

export type ActionErrorCode =
  | 'gameOver'
  | 'unknownFigure'
  | 'notYourTurn'
  | 'wrongPhase'
  | 'invalidPath'
  | 'pathTooLong'
  | 'noTarget'
  | 'invalidTarget'
  | 'friendlyFireOff'
  | 'notYetAvailable'
  | 'tileExists'
  | 'notAdjacent'
  | 'maxTiles'
  | 'noTile'
  | 'tileOccupied'
  | 'minTiles'
  | 'wouldDisconnect'
  | 'tileActionsUsed';

export interface ActionError {
  code: ActionErrorCode;
  detail?: string;
}

export type GameEvent =
  | { type: 'gameStarted' }
  | { type: 'roundStarted'; round: number }
  | { type: 'turnStarted'; figure: FigureId }
  | { type: 'tileLeft'; figure: FigureId; pos: Pos }
  | { type: 'tileEntered'; figure: FigureId; pos: Pos; firstVisit: boolean }
  | { type: 'attackDeclared'; attacker: FigureId; target: FigureId; chance: Percent }
  | {
      type: 'wheelResolved';
      attacker: FigureId;
      target: FigureId;
      chance: Percent;
      /** 0 ≤ roll < 100; hit if roll < chance. */
      roll: number;
      hit: boolean;
    }
  | { type: 'damaged'; figure: FigureId; amount: number; source: 'attack' | 'rule' }
  | { type: 'died'; figure: FigureId; pos: Pos }
  | { type: 'tileAdded'; figure: FigureId; pos: Pos; textureId: string | null }
  | { type: 'tileRemoved'; figure: FigureId; pos: Pos }
  | { type: 'passed'; figure: FigureId }
  | { type: 'turnEnded'; figure: FigureId }
  | { type: 'roundEnded'; round: number }
  | { type: 'gameOver'; result: GameResult };

export type ApplyResult =
  { ok: true; state: GameState; events: GameEvent[] } | { ok: false; error: ActionError };
