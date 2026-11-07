// Resolves the own effects, functions and NPC types a rule needs (transitively), so that
// the rule can carry them into a game (RuleDefinition.bundle).
import type { NpcType } from '../engine/types';
import type { Effect, EffectDef, Expr, FunctionDef, RuleAST, RuleBundle, Stmt } from './ast';

/** Calls every sub-expression of `e` (including `e`). */
export function visitExpr(e: Expr, fn: (e: Expr) => void): void {
  fn(e);
  switch (e.kind) {
    case 'cmp':
    case 'arith':
      visitExpr(e.left, fn);
      visitExpr(e.right, fn);
      break;
    case 'and':
    case 'or':
      e.items.forEach((i) => visitExpr(i, fn));
      break;
    case 'list':
      e.items.forEach((i) => visitExpr(i, fn));
      break;
    case 'not':
      visitExpr(e.item, fn);
      break;
    case 'query':
    case 'fcall':
      e.args.forEach((a) => visitExpr(a, fn));
      break;
    case 'prop':
      visitExpr(e.of, fn);
      break;
    case 'targets':
      if (e.target.kind === 'value') visitExpr(e.target.expr, fn);
      break;
    case 'tiles':
      if (e.target.kind === 'value') visitExpr(e.target.expr, fn);
      break;
    default:
      break;
  }
}

function exprsOfEffect(e: Effect): Expr[] {
  const out: Expr[] = [];
  const target = (t: { kind: string; expr?: Expr }) => {
    if (t.kind === 'value' && t.expr) out.push(t.expr);
  };
  switch (e.kind) {
    case 'spawn':
    case 'setTileType':
    case 'removeTile':
    case 'addTileNear':
      target(e.at);
      break;
    case 'push':
      target(e.target);
      target(e.from);
      break;
    case 'teleport':
      target(e.target);
      if (e.near) target(e.near);
      break;
    case 'setVar':
      if (e.scope.kind === 'figures') target(e.scope.target);
      out.push(e.value);
      break;
    case 'call':
      out.push(...e.args);
      break;
    case 'message':
    case 'code':
      break;
    default:
      target(e.target);
  }
  return out;
}

/** Walks statements: every effect and every expression (also inside code effects). */
export function visitStmts(
  stmts: Stmt[],
  onEffect: (e: Effect) => void,
  onExpr: (e: Expr) => void,
): void {
  const effect = (e: Effect) => {
    onEffect(e);
    if (e.kind === 'code') visitStmts([e.stmt], onEffect, onExpr);
    for (const x of exprsOfEffect(e)) visitExpr(x, onExpr);
  };
  for (const s of stmts) {
    switch (s.kind) {
      case 'do':
        effect(s.effect);
        break;
      case 'if':
        visitExpr(s.cond, onExpr);
        visitStmts(s.then, onEffect, onExpr);
        visitStmts(s.else, onEffect, onExpr);
        break;
      case 'repeat':
        visitExpr(s.times, onExpr);
        visitStmts(s.body, onEffect, onExpr);
        break;
      case 'forEach':
        visitExpr(s.in, onExpr);
        visitStmts(s.body, onEffect, onExpr);
        break;
      case 'while':
        visitExpr(s.cond, onExpr);
        visitStmts(s.body, onEffect, onExpr);
        break;
      case 'after':
        visitStmts(s.body, onEffect, onExpr);
        break;
      case 'pick':
        visitExpr(s.from, onExpr);
        break;
      case 'let':
      case 'return':
      case 'listAdd':
        visitExpr(s.value, onExpr);
        break;
      case 'play':
        visitExpr(s.sound, onExpr);
        break;
      case 'texture':
        visitExpr(s.tile, onExpr);
        visitExpr(s.name, onExpr);
        break;
      case 'say':
        visitExpr(s.text, onExpr);
        break;
      case 'wait':
      case 'send':
        break;
    }
  }
}

function effectsOfStmts(stmts: Stmt[]): Effect[] {
  const out: Effect[] = [];
  visitStmts(
    stmts,
    (e) => out.push(e),
    () => {},
  );
  return out;
}

export function effectsOfDef(def: EffectDef): Effect[] {
  return effectsOfStmts(def.body);
}

/**
 * Collects own effects (by name), functions (by name) and NPC types (by id) used by a rule,
 * transitively: effects calling effects, functions calling functions, spawned NPC types
 * whose own behavior calls effects or functions.
 */
export function resolveBundle(
  rule: RuleAST,
  effects: readonly EffectDef[],
  npcTypes: readonly NpcType[],
  functions: readonly FunctionDef[] = [],
): RuleBundle & { missing: string[] } {
  const effectsByName = new Map(effects.map((e) => [e.name.toLowerCase(), e]));
  const functionsByName = new Map(functions.map((f) => [f.name.toLowerCase(), f]));
  const usedEffects = new Map<string, EffectDef>();
  const usedFunctions = new Map<string, FunctionDef>();
  const usedNpcs = new Set<string>();
  const missing: string[] = [];

  const visit = (stmts: Stmt[]) => visitStmts(stmts, onEffect, onExpr);
  function onExpr(e: Expr): void {
    if (e.kind !== 'fcall') return;
    const key = e.name.toLowerCase();
    if (usedFunctions.has(key)) return;
    const def = functionsByName.get(key);
    if (!def) {
      missing.push(e.name);
      return;
    }
    usedFunctions.set(key, def);
    visit(def.body);
  }
  function onEffect(e: Effect): void {
    if (e.kind === 'spawn' && !usedNpcs.has(e.npcType)) {
      usedNpcs.add(e.npcType);
      const type = npcTypes.find((n) => n.id === e.npcType);
      if (type?.code) visit(type.code);
    }
    if (e.kind !== 'call') return;
    const key = e.effect.toLowerCase();
    if (usedEffects.has(key)) return;
    const def = effectsByName.get(key);
    if (!def) {
      missing.push(e.effect);
      return;
    }
    usedEffects.set(key, def);
    visit(def.body);
  }

  for (const c of rule.conditions) visitExpr(c, onExpr);
  visit([...rule.effects, ...rule.elseEffects].map((effect) => ({ kind: 'do', effect })));
  const bundle: RuleBundle & { missing: string[] } = {
    effects: [...usedEffects.values()],
    npcTypes: npcTypes.filter((n) => usedNpcs.has(n.id)),
    missing,
  };
  if (usedFunctions.size > 0) bundle.functions = [...usedFunctions.values()];
  return bundle;
}
