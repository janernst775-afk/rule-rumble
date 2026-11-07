// Fixed protection rules (SPEC 6.2) that are not game settings. Configurable limits
// (max rules, rule damage per round, spawns, NPCs, board size) live in Settings.

export const RULE_LIMITS = {
  /** Effects per rule (DANN) and in the SONST branch. */
  maxEffects: 3,
  maxElseEffects: 3,
  /** Damage / heal / shield amount per effect. */
  maxAmountPerEffect: 1,
  /** Movement result is always 0..3 (see query.MOVE_RANGE). */
  moveDelta: { min: -3, max: 3 },
  /** Wheel chance changes; the result is clamped to 25..75 % (see query.WHEEL_RULE_RANGE). */
  wheelDelta: { min: -50, max: 50 },
  /** Rounds a status from a rule lasts. */
  statusRounds: { min: 1, max: 5 },
  /** AUSSETZEN: at most one turn in a row. */
  maxSkipTurns: 1,
  /** SCHIEBE distance. */
  maxPush: 1,
  /** Variables are always clamped to this range. */
  variable: { min: -1000, max: 1000 },
  /** ZEIGE text length. */
  maxMessageLength: 80,
  /** ALLE N RUNDEN */
  everyNRounds: { min: 1, max: 20 },
  /** DAUER */
  duration: { min: 1, max: 50 },
  /** LIMIT count */
  limitCount: { min: 1, max: 10 },
  maxNameLength: 40,
  maxConditions: 6,
} as const;

/** Chain reactions and computing budget (SPEC 6.2, never configurable). */
export const CHAIN_LIMITS = {
  /** Rules react to events up to this chain depth. */
  maxDepth: 3,
  /** Effect executions per turn. */
  maxEffectsPerTurn: 50,
} as const;

/** Own effects (SPEC 5.7 / 5.8): computing budget per rule firing and structural limits. */
export const EFFECT_LIMITS = {
  maxSteps: 10_000,
  maxCallDepth: 5,
  maxRepeat: 10,
  maxListLength: 200,
  maxRadius: 5,
  maxWait: 3,
  maxParams: 4,
  maxStmts: 40,
  maxNesting: 6,
} as const;

/** Profi-Code (SPEC 5.8): fixed protection rules on top of EFFECT_LIMITS. */
export const CODE_LIMITS = {
  /** Calls of own functions nested in each other (recursion). */
  maxRecursion: 20,
  /** Statements of a code text definition (effects, functions, NPC behavior). */
  maxStmts: 200,
  maxNesting: 10,
  /** NACH n RUNDEN */
  delayRounds: { min: 1, max: 10 },
  /** NACH blocks waiting at the same time; more are dropped. */
  maxDelayed: 20,
  /** Length of event names and texts built at runtime. */
  maxEventName: 30,
  maxText: 200,
  /** Recorded debugger steps per run. */
  maxTrace: 2000,
} as const;

/** Own NPC types (SPEC 5.9). */
export const NPC_LIMITS = {
  hp: { min: 1, max: 3 },
  move: { min: 0, max: 3 },
} as const;

/** Comeback: dodge chance against rule damage at 1 life (SPEC 6.3). */
export const COMEBACK_DODGE_PERCENT = 50;
