import type { Settings } from './types';

/** Allowed ranges for numeric settings (SPEC 2.2). */
export const SETTINGS_LIMITS = {
  maxActiveRules: { min: 2, max: 15 },
  ruleDamagePerFigurePerRound: { min: 1, max: 5 },
  startSize: { min: 4, max: 10 },
  tiles: { min: 8, max: 200 },
  heroHp: { min: 1, max: 10 },
  bossHpPerHero: { min: 1, max: 10 },
  bossHpFixed: { min: 1, max: 40 },
  move: { min: 0, max: 3 },
  wheelChance: { min: 10, max: 90 },
  wheelChanceSpread: { min: 0, max: 20 },
  npcsOnBoard: { min: 0, max: 30 },
  npcSpawnsPerRound: { min: 0, max: 10 },
  turnTimeSec: { min: 15, max: 180 },
  roundLimit: { min: 10, max: 100 },
  heroChaos: { min: 0, max: 50 },
} as const;

export const DEFAULT_SETTINGS: Settings = {
  version: 1,
  rules: {
    maxActive: 6,
    overflow: 'dropOldest',
    activationDelay: 1,
    proCodeAllowed: true,
    ruleDamagePerFigurePerRound: 2,
    allowRandom: true,
  },
  board: {
    startSize: 6,
    minTiles: 16,
    maxTiles: 60,
    customTextures: true,
    tileActionsPerAction: 1,
  },
  figures: {
    heroHp: 3,
    // Tuned with `npm run sim` (v0.8): boss win rate 40–60 % per template.
    bossHp: { mode: 'perHero', perHero: 4, solo: 3 },
    heroMove: 1,
    bossMove: 2,
  },
  combat: {
    wheelChance: 50,
    wheelChanceSpread: 0,
    friendlyFire: true,
    comeback: false,
  },
  npcs: { maxOnBoard: 8, maxSpawnsPerRound: 3 },
  tempo: { turnTimeSec: null, roundLimit: null },
  bots: { speed: 'normal', heroChaos: 5 },
};

export type TemplateId = 'classic' | 'chaos' | 'tactics' | 'quick' | 'builder' | 'solo';

export const TEMPLATE_IDS: readonly TemplateId[] = [
  'classic',
  'chaos',
  'tactics',
  'quick',
  'builder',
  'solo',
];

function withDefaults(patch: (s: Settings) => void): Settings {
  const s = cloneSettings(DEFAULT_SETTINGS);
  patch(s);
  return s;
}

/** The six built-in templates (SPEC 2.2). */
export const TEMPLATES: Record<TemplateId, Settings> = {
  classic: cloneSettings(DEFAULT_SETTINGS),
  chaos: withDefaults((s) => {
    s.rules.maxActive = 10;
    s.npcs.maxOnBoard = 15;
    s.npcs.maxSpawnsPerRound = 5;
    s.combat.wheelChance = 50;
    s.combat.wheelChanceSpread = 10;
    s.bots.heroChaos = 25;
  }),
  tactics: withDefaults((s) => {
    s.figures.bossHp = { mode: 'perHero', perHero: 5, solo: 4 };
    s.rules.maxActive = 4;
    s.rules.allowRandom = false;
    s.board.startSize = 5;
    s.board.minTiles = 12;
    s.board.maxTiles = 40;
  }),
  quick: withDefaults((s) => {
    s.board.startSize = 4;
    s.board.minTiles = 10;
    s.board.maxTiles = 30;
    s.tempo.turnTimeSec = 20;
    s.figures.bossHp = { mode: 'perHero', perHero: 3, solo: 2 };
    s.figures.heroHp = 2;
    s.figures.bossMove = 1;
    s.figures.heroMove = 2;
    s.combat.wheelChance = 70;
    s.combat.comeback = true;
  }),
  builder: withDefaults((s) => {
    s.figures.bossHp = { mode: 'perHero', perHero: 5, solo: 4 };
    s.figures.heroHp = 4;
    s.board.tileActionsPerAction = 2;
    s.board.maxTiles = 100;
  }),
  solo: withDefaults((s) => {
    s.combat.comeback = true;
  }),
};

export function cloneSettings(s: Settings): Settings {
  return structuredClone(s);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(value)));
}

/** Clamps all values into their allowed ranges and fixes inconsistent board limits. */
export function sanitizeSettings(input: Settings): Settings {
  const s = cloneSettings(input);
  const L = SETTINGS_LIMITS;
  if (s.rules.maxActive !== null) {
    s.rules.maxActive = clamp(s.rules.maxActive, L.maxActiveRules.min, L.maxActiveRules.max);
  }
  s.rules.ruleDamagePerFigurePerRound = clamp(
    s.rules.ruleDamagePerFigurePerRound,
    L.ruleDamagePerFigurePerRound.min,
    L.ruleDamagePerFigurePerRound.max,
  );
  s.board.startSize = clamp(s.board.startSize, L.startSize.min, L.startSize.max);
  s.board.minTiles = clamp(s.board.minTiles, L.tiles.min, L.tiles.max);
  s.board.maxTiles = clamp(s.board.maxTiles, L.tiles.min, L.tiles.max);
  const startTiles = s.board.startSize * s.board.startSize;
  s.board.minTiles = Math.min(s.board.minTiles, startTiles);
  s.board.maxTiles = Math.max(s.board.maxTiles, startTiles);
  s.figures.heroHp = clamp(s.figures.heroHp, L.heroHp.min, L.heroHp.max);
  if (s.figures.bossHp.mode === 'perHero') {
    s.figures.bossHp.perHero = clamp(
      s.figures.bossHp.perHero,
      L.bossHpPerHero.min,
      L.bossHpPerHero.max,
    );
    s.figures.bossHp.solo = clamp(s.figures.bossHp.solo, L.bossHpFixed.min, L.bossHpFixed.max);
  } else {
    s.figures.bossHp.value = clamp(s.figures.bossHp.value, L.bossHpFixed.min, L.bossHpFixed.max);
  }
  s.figures.heroMove = clamp(s.figures.heroMove, L.move.min, L.move.max);
  s.figures.bossMove = clamp(s.figures.bossMove, L.move.min, L.move.max);
  s.combat.wheelChance = clamp(s.combat.wheelChance, L.wheelChance.min, L.wheelChance.max);
  s.combat.wheelChanceSpread = clamp(
    s.combat.wheelChanceSpread,
    L.wheelChanceSpread.min,
    L.wheelChanceSpread.max,
  );
  s.npcs.maxOnBoard = clamp(s.npcs.maxOnBoard, L.npcsOnBoard.min, L.npcsOnBoard.max);
  s.npcs.maxSpawnsPerRound = clamp(
    s.npcs.maxSpawnsPerRound,
    L.npcSpawnsPerRound.min,
    L.npcSpawnsPerRound.max,
  );
  if (s.tempo.turnTimeSec !== null) {
    s.tempo.turnTimeSec = clamp(s.tempo.turnTimeSec, L.turnTimeSec.min, L.turnTimeSec.max);
  }
  if (s.tempo.roundLimit !== null) {
    s.tempo.roundLimit.rounds = clamp(
      s.tempo.roundLimit.rounds,
      L.roundLimit.min,
      L.roundLimit.max,
    );
  }
  s.bots.heroChaos = clamp(s.bots.heroChaos, L.heroChaos.min, L.heroChaos.max);
  return s;
}

/** Boss hit points for the given number of heroes (SPEC 2.2, 3). */
export function bossHpFor(settings: Settings, heroCount: number): number {
  const b = settings.figures.bossHp;
  if (b.mode === 'fixed') return b.value;
  if (heroCount <= 1) return b.solo;
  return b.perHero * heroCount;
}

/** Counts top-level differences between two settings objects (for "3 values changed"). */
export function countChangedValues(base: Settings, current: Settings): number {
  let count = 0;
  const walk = (a: unknown, b: unknown): void => {
    if (a !== null && b !== null && typeof a === 'object' && typeof b === 'object') {
      const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
      for (const k of keys) {
        walk((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]);
      }
    } else if (a !== b) {
      count++;
    }
  };
  walk(base, current);
  return count;
}
