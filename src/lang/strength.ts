// Strength estimate "harmlos / spannend / heftig" (SPEC 6.3), information only.
// Computed from the effects, randomness and how often the trigger happens.
import type { Effect, Expr, RuleAST, Target, Trigger } from './ast';

export type StrengthLevel = 'harmless' | 'exciting' | 'heavy';

/** Rough firings per round in a game with ~4 figures. */
function frequency(t: Trigger): number {
  switch (t.kind) {
    case 'roundStart':
    case 'roundEnd':
      return 1;
    case 'everyNRounds':
      return 1 / t.n;
    case 'turnStart':
    case 'turnEnd':
      return 4;
    case 'enters':
      return t.newOnly ? 1.5 : 3;
    case 'leaves':
      return 3;
    case 'attack':
    case 'hit':
    case 'miss':
      return 0.8;
    case 'damage':
      return 1;
    case 'dies':
      return 0.2;
    case 'tileAdded':
    case 'tileRemoved':
      return 0.4;
  }
}

function targetCount(t: Target): number {
  switch (t.kind) {
    case 'all':
      return 4;
    case 'onTile':
    case 'neighbors':
      return 1.5;
    case 'allNpcs':
      return 1;
    default:
      return 1;
  }
}

const EFFECT_WEIGHT: Record<Effect['kind'], number> = {
  damage: 3,
  spawn: 3,
  skip: 2,
  removeTile: 2,
  heal: 2,
  teleport: 1.5,
  push: 1,
  moveMod: 1,
  wheelMod: 1,
  shield: 1,
  setTileType: 1,
  addTileNear: 0.5,
  setVar: 0.2,
  message: 0,
};

function effectWeight(e: Effect): number {
  const base = EFFECT_WEIGHT[e.kind];
  return 'target' in e ? base * targetCount(e.target) : base;
}

/** Probability that the conditions hold (chance exact, other conditions guessed). */
function conditionFactor(conds: Expr[]): number {
  let f = 1;
  for (const c of conds) f *= c.kind === 'chance' ? c.percent / 100 : 0.5;
  return f;
}

export function ruleStrength(rule: RuleAST): { score: number; level: StrengthLevel } {
  let perRound = frequency(rule.trigger);
  if (rule.limit) {
    const cap =
      rule.limit.per === 'game'
        ? rule.limit.count / 10
        : rule.limit.count * (rule.limit.per === 'turn' ? 4 : 1);
    perRound = Math.min(perRound, cap);
  }
  const p = conditionFactor(rule.conditions);
  const then = rule.effects.reduce((s, e) => s + effectWeight(e), 0);
  const otherwise = rule.elseEffects.reduce((s, e) => s + effectWeight(e), 0);
  let score = perRound * (p * then + (1 - p) * otherwise);
  if (rule.duration !== null) score *= Math.min(1, rule.duration / 10);
  const level: StrengthLevel = score < 1.5 ? 'harmless' : score < 4 ? 'exciting' : 'heavy';
  return { score: Math.round(score * 10) / 10, level };
}
