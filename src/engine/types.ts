import type { EffectDef, FunctionDef, RuleDefinition, RuntimeValue, Stmt } from '../lang/ast';

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

export type TileType = 'normal' | 'lava' | 'eis' | 'heilquelle' | 'falle' | 'wasser';

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
  | { kind: 'wheelMod'; delta: Percent; rounds: number }
  /** Set after a skipped turn: the same figure cannot be skipped twice in a row. */
  | { kind: 'skipCooldown' };

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

export type NpcBehavior = 'chase' | 'wander' | 'stand' | 'flee';

export interface NpcType {
  id: string;
  name: string;
  /** Short symbol shown on the token, e.g. "Z". */
  symbol: string;
  color: string;
  /** Own NPC types: 128×128 picture as data URL (drawn or uploaded). */
  image?: string | null;
  hp: number;
  move: number;
  behavior: NpcBehavior;
  /** NPC "…" ZUG (Profi-Code): replaces the movement template (SPEC 5.8). */
  code?: Stmt[] | null;
}

/** Context values of an event, as rules and code see them (plain JSON). */
export interface EventContext {
  trigger?: FigureId;
  attacker?: FigureId;
  target?: FigureId;
  tile?: Pos;
  fromTile?: Pos;
  amount?: number;
  /** selbst: the NPC whose turn it is */
  self?: FigureId;
}

/** NACH n RUNDEN … ENDE: code waiting for a later round (SPEC 5.8). */
export interface DelayedCode {
  id: string;
  /** Rule instance that scheduled it; the code is dropped if the rule is gone. */
  rule: string;
  name: string;
  dueRound: number;
  body: Stmt[];
  locals: Record<string, RuntimeValue>;
  ctx: EventContext;
}

/** A rule in the running game. */
export interface ActiveRule {
  /** Instance id in this game, e.g. "r3". */
  id: string;
  def: RuleDefinition;
  authorId: FigureId;
  /** Increasing number: rules react in the order they were added (SPEC 5.6). */
  order: number;
  addedRound: number;
  activeFromRound: number;
  /** Last round in which the rule is active; null = until the end of the game. */
  expiresAfterRound: number | null;
  firedThisRound: number;
  firedThisTurn: number;
  firedTotal: number;
}

/** Overflow variant "Abstimmung": all living heroes and the boss vote which rule goes. */
export interface PendingVote {
  candidate: RuleDefinition;
  authorId: FigureId;
  voters: FigureId[];
  /** voter → active rule id */
  votes: Record<FigureId, string>;
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
  /** Rule effects executed this turn (budget, SPEC 6.2). */
  effectsUsed: number;
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
  /** Own effects from the effect workshop, brought in by rules (SPEC 5.7). */
  effects: EffectDef[];
  /** Own functions (Profi-Code), brought in by rules (SPEC 5.8). */
  functions: FunctionDef[];
  /** NACH n RUNDEN blocks waiting for their round. */
  delayed: DelayedCode[];
  rules: ActiveRule[];
  pendingVote: PendingVote | null;
  /** Rule damage taken per figure this round (attacks do not count). */
  ruleDamage: Record<FigureId, number>;
  spawnsThisRound: number;
  /** Texture id → name, so rules can ask for feld.textur. */
  textureNames: Record<string, string>;
  world: Record<string, number>;
  stats: Record<FigureId, FigureStats>;
  log: LogEntry[];
  result: GameResult | null;
  nextId: number;
}

export type Action =
  | { type: 'move'; actor: FigureId; path: Pos[] }
  | { type: 'attack'; actor: FigureId; target: FigureId }
  | {
      type: 'addTile';
      actor: FigureId;
      pos: Pos;
      textureId: string | null;
      /** Name of the texture, registered for rules (feld.textur). */
      textureName?: string | null;
    }
  | { type: 'removeTile'; actor: FigureId; pos: Pos }
  | {
      type: 'addRule';
      actor: FigureId;
      rule: RuleDefinition;
      /** Overflow "Ersteller wählt": the active rule that has to go. */
      replaceRuleId?: string;
    }
  | { type: 'voteRule'; actor: FigureId; ruleId: string }
  /** Lets the NPC on turn act (behavior is computed by the engine). */
  | { type: 'npcAct'; actor: FigureId }
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
  | 'tileActionsUsed'
  | 'invalidRule'
  | 'ruleLimitReached'
  | 'chooseRuleToReplace'
  | 'unknownRule'
  | 'votePending'
  | 'noVote'
  | 'notVoter'
  | 'alreadyVoted'
  | 'notNpc'
  | 'npcActsAlone';

export interface ActionError {
  code: ActionErrorCode;
  detail?: string;
}

export type GameEvent =
  | { type: 'gameStarted' }
  | { type: 'roundStarted'; round: number }
  | { type: 'turnStarted'; figure: FigureId }
  | { type: 'tileLeft'; figure: FigureId; pos: Pos; to: Pos }
  | { type: 'tileEntered'; figure: FigureId; pos: Pos; from: Pos; firstVisit: boolean }
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
  | { type: 'tileAdded'; figure: FigureId | null; pos: Pos; textureId: string | null }
  | { type: 'tileRemoved'; figure: FigureId | null; pos: Pos }
  | { type: 'ruleAdded'; rule: string; name: string; activeFromRound: number }
  | { type: 'ruleActivated'; rule: string; name: string }
  | { type: 'ruleRemoved'; rule: string; name: string; reason: 'overflow' | 'expired' | 'vote' }
  | { type: 'ruleFired'; rule: string; name: string }
  | { type: 'chainStopped'; rule: string; name: string; reason: 'depth' | 'budget' }
  | { type: 'message'; rule: string; text: string }
  | { type: 'spawned'; figure: FigureId; pos: Pos }
  | { type: 'spawnBlocked'; rule: string }
  | { type: 'healed'; figure: FigureId; amount: number }
  | { type: 'statusAdded'; figure: FigureId; status: Status }
  | { type: 'turnSkipped'; figure: FigureId }
  | { type: 'dodged'; figure: FigureId }
  | { type: 'damageCapped'; figure: FigureId }
  | { type: 'tileTypeChanged'; pos: Pos; tileType: TileType }
  | { type: 'voteStarted'; voters: FigureId[] }
  | { type: 'voteCast'; figure: FigureId; rule: string }
  | { type: 'soundPlayed'; rule: string; sound: string }
  | { type: 'waited'; rule: string; seconds: number }
  | { type: 'textureChanged'; pos: Pos; textureId: string | null }
  | { type: 'effectAborted'; rule: string; name: string; reason: 'steps' | 'depth' | 'list' }
  /** SENDE "name" (Profi-Code): rules with WENN EREIGNIS "name" react. */
  | { type: 'customEvent'; rule: string; name: string }
  | { type: 'passed'; figure: FigureId }
  | { type: 'turnEnded'; figure: FigureId }
  | { type: 'roundEnded'; round: number }
  | { type: 'gameOver'; result: GameResult };

export type ApplyResult =
  { ok: true; state: GameState; events: GameEvent[] } | { ok: false; error: ActionError };
