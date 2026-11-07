// Resolves the own effects and NPC types a rule needs (transitively), so that the rule
// can carry them into a game (RuleDefinition.bundle).
import type { NpcType } from '../engine/types';
import type { Effect, EffectDef, RuleAST, RuleBundle, Stmt } from './ast';

function effectsOfStmts(stmts: Stmt[], out: Effect[]): void {
  for (const s of stmts) {
    if (s.kind === 'do') out.push(s.effect);
    else if (s.kind === 'if') {
      effectsOfStmts(s.then, out);
      effectsOfStmts(s.else, out);
    } else if (s.kind === 'repeat' || s.kind === 'forEach') effectsOfStmts(s.body, out);
  }
}

export function effectsOfDef(def: EffectDef): Effect[] {
  const out: Effect[] = [];
  effectsOfStmts(def.body, out);
  return out;
}

/** Collects own effects (by name) and NPC types (by id) used by a rule, transitively. */
export function resolveBundle(
  rule: RuleAST,
  effects: readonly EffectDef[],
  npcTypes: readonly NpcType[],
): RuleBundle & { missing: string[] } {
  const byName = new Map(effects.map((e) => [e.name.toLowerCase(), e]));
  const usedEffects = new Map<string, EffectDef>();
  const usedNpcs = new Set<string>();
  const missing: string[] = [];
  const visit = (list: Effect[]) => {
    for (const e of list) {
      if (e.kind === 'spawn') usedNpcs.add(e.npcType);
      if (e.kind !== 'call') continue;
      const key = e.effect.toLowerCase();
      if (usedEffects.has(key)) continue;
      const def = byName.get(key);
      if (!def) {
        missing.push(e.effect);
        continue;
      }
      usedEffects.set(key, def);
      visit(effectsOfDef(def));
    }
  };
  visit([...rule.effects, ...rule.elseEffects]);
  return {
    effects: [...usedEffects.values()],
    npcTypes: npcTypes.filter((n) => usedNpcs.has(n.id)),
    missing,
  };
}
