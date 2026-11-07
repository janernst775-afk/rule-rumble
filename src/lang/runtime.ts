// Connects rules with game events (SPEC 5.6). Active rules react in the order they were
// added; effects only change the world through engine/primitives.ts. Chain depth and
// the effect budget per turn are enforced here (SPEC 6.2).
import type { Bus } from '../engine/bus';
import { CHAIN_LIMITS } from '../engine/limits';
import { isRuleActive } from '../engine/rules';
import { emit } from '../engine/bus';
import type { ActiveRule, Figure, GameEvent, GameState, NpcType } from '../engine/types';
import type { Trigger } from './ast';
import {
  EffectAbort,
  Return,
  evaluate,
  execEffect,
  newEnv,
  runStmts,
  truthy,
  type CodeSource,
  type RuleContext,
  type Value,
} from './interpreter';

export type { RuleContext } from './interpreter';

/** Maps an engine event to the trigger kind(s) it raises and their context. */
function contextFor(
  event: GameEvent,
): { matches: (t: Trigger, s: GameState) => boolean; ctx: RuleContext } | null {
  switch (event.type) {
    case 'roundStarted':
      return {
        matches: (t, s) =>
          t.kind === 'roundStart' || (t.kind === 'everyNRounds' && s.round % t.n === 0),
        ctx: {},
      };
    case 'roundEnded':
      return { matches: (t) => t.kind === 'roundEnd', ctx: {} };
    case 'turnStarted':
      return { matches: (t) => t.kind === 'turnStart', ctx: { trigger: event.figure } };
    case 'turnEnded':
      return { matches: (t) => t.kind === 'turnEnd', ctx: { trigger: event.figure } };
    case 'tileEntered':
      return {
        matches: (t) => t.kind === 'enters' && (!t.newOnly || event.firstVisit),
        ctx: { trigger: event.figure, tile: event.pos, fromTile: event.from },
      };
    case 'tileLeft':
      return {
        matches: (t) => t.kind === 'leaves',
        ctx: { trigger: event.figure, tile: event.pos, fromTile: event.pos },
      };
    case 'attackDeclared':
      return {
        matches: (t) => t.kind === 'attack',
        ctx: { attacker: event.attacker, target: event.target },
      };
    case 'wheelResolved':
      return {
        matches: (t) => t.kind === (event.hit ? 'hit' : 'miss'),
        ctx: { attacker: event.attacker, target: event.target },
      };
    case 'damaged':
      return {
        matches: (t) => t.kind === 'damage',
        ctx: { trigger: event.figure, amount: event.amount },
      };
    case 'died':
      return { matches: (t) => t.kind === 'dies', ctx: { trigger: event.figure, tile: event.pos } };
    case 'tileAdded':
      return {
        matches: (t) => t.kind === 'tileAdded',
        ctx: { trigger: event.figure ?? undefined, tile: event.pos },
      };
    case 'tileRemoved':
      return {
        matches: (t) => t.kind === 'tileRemoved',
        ctx: { trigger: event.figure ?? undefined, tile: event.pos },
      };
    case 'customEvent':
      return {
        matches: (t) => t.kind === 'custom' && t.event.toLowerCase() === event.name,
        ctx: {},
      };
    default:
      return null;
  }
}

function limitReached(rule: ActiveRule): boolean {
  const limit = rule.def.ast.limit;
  if (!limit) return false;
  const used =
    limit.per === 'round'
      ? rule.firedThisRound
      : limit.per === 'turn'
        ? rule.firedThisTurn
        : rule.firedTotal;
  return used >= limit.count;
}

export function reactToEvent(bus: Bus, event: GameEvent): void {
  if (event.type === 'roundStarted') runDelayed(bus);
  const mapped = contextFor(event);
  if (!mapped) return;
  const state = bus.state;
  // Snapshot: rules added or removed while reacting do not change this pass.
  const rules = state.rules.filter(
    (r) => isRuleActive(state, r) && mapped.matches(r.def.ast.trigger, state),
  );
  for (const rule of rules) {
    if (state.status !== 'playing') return;
    if (!state.rules.some((r) => r.id === rule.id)) continue;
    if (limitReached(rule)) continue;
    if (bus.depth >= CHAIN_LIMITS.maxDepth) {
      stop(bus, rule, 'depth');
      continue;
    }
    runRule(bus, rule, mapped.ctx);
  }
}

function stop(bus: Bus, rule: ActiveRule, reason: 'depth' | 'budget'): void {
  bus.state.log.push({
    round: bus.state.round,
    key: reason === 'depth' ? 'log.chainStoppedDepth' : 'log.chainStoppedBudget',
    params: { rule: rule.def.ast.name },
  });
  emit(bus, { type: 'chainStopped', rule: rule.id, name: rule.def.ast.name, reason });
}

function runRule(bus: Bus, rule: ActiveRule, ctx: RuleContext): void {
  const state = bus.state;
  const ast = rule.def.ast;
  // One environment (and step budget) per firing: conditions and effects share it.
  const env = newEnv(bus, sourceOf(rule), ctx);
  let ok: boolean;
  try {
    ok = ast.conditions.every((c) => truthy(evaluate(env, c)));
  } catch (e) {
    if (e instanceof EffectAbort) return aborted(bus, sourceOf(rule), e);
    throw e;
  }
  const branch = ok ? ast.effects : ast.elseEffects;
  if (branch.length === 0) return;
  rule.firedThisRound += 1;
  rule.firedThisTurn += 1;
  rule.firedTotal += 1;
  state.log.push({ round: state.round, key: 'log.ruleFired', params: { rule: ast.name } });
  bus.events.push({ type: 'ruleFired', rule: rule.id, name: ast.name });
  bus.depth += 1;
  bus.causes.push(rule.id);
  try {
    for (const effect of branch) {
      if (state.status !== 'playing') return;
      if (state.turn.effectsUsed >= CHAIN_LIMITS.maxEffectsPerTurn) {
        stop(bus, rule, 'budget');
        return;
      }
      state.turn.effectsUsed += 1;
      execEffect(env, effect);
    }
  } catch (e) {
    // Budget, call depth or list limit exceeded: stop this rule, keep its changes so far.
    if (e instanceof EffectAbort) aborted(bus, sourceOf(rule), e);
    else if (!(e instanceof Return)) throw e;
  } finally {
    bus.depth -= 1;
    bus.causes.pop();
  }
}

function sourceOf(rule: ActiveRule): CodeSource {
  return { id: rule.id, name: rule.def.ast.name };
}

function aborted(bus: Bus, source: CodeSource, e: EffectAbort): void {
  bus.state.log.push({
    round: bus.state.round,
    key: `log.effectAborted.${e.reason}`,
    params: { rule: source.name },
  });
  bus.events.push({
    type: 'effectAborted',
    rule: source.id,
    name: source.name,
    reason: e.reason,
  });
}

/** Runs code with its own budget; limits stop it, changes until then stay. */
function runGuarded(bus: Bus, source: CodeSource, run: () => void): void {
  bus.depth += 1;
  bus.causes.push(source.id);
  try {
    run();
  } catch (e) {
    if (e instanceof EffectAbort) aborted(bus, source, e);
    else if (!(e instanceof Return)) throw e;
  } finally {
    bus.depth -= 1;
    bus.causes.pop();
  }
}

/** NACH n RUNDEN: blocks whose round has come run at round start (SPEC 5.8). */
function runDelayed(bus: Bus): void {
  const state = bus.state;
  const due = (state.delayed ?? []).filter((d) => d.dueRound <= state.round);
  if (due.length === 0) return;
  state.delayed = state.delayed.filter((d) => d.dueRound > state.round);
  for (const d of due) {
    if (state.status !== 'playing') return;
    // The code belongs to its rule: if the rule left the game, the code is dropped.
    const rule = state.rules.find((r) => r.id === d.rule);
    if (!rule) continue;
    const source = sourceOf(rule);
    const env = newEnv(bus, source, d.ctx);
    for (const [k, v] of Object.entries(d.locals)) env.locals.set(k, v as Value);
    runGuarded(bus, source, () => runStmts(env, d.body));
  }
}

/** NPC "…" ZUG: the NPC's own behavior replaces its movement template (SPEC 5.8). */
export function runNpcCode(bus: Bus, npc: Figure, type: NpcType): void {
  if (!type.code || type.code.length === 0) return;
  const source: CodeSource = { id: npc.id, name: type.name };
  const env = newEnv(bus, source, { self: npc.id });
  runGuarded(bus, source, () => runStmts(env, type.code ?? []));
}
