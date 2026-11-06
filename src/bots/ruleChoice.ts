// Rule choice for bots (SPEC 7): try library rules on a copy of the game, play a short
// look-ahead with a fast policy and take the rule that helps the bot most. Because rules
// apply to everyone, this is naturally limited.
import { manhattan } from '../engine/board';
import { attackTargets, currentFigure, moveOptions } from '../engine/query';
import { applyAction } from '../engine/reducer';
import { randomPick, type RngHolder } from '../engine/rng';
import { oldestRule, ruleSlotsFull } from '../engine/rules';
import type { Action, Figure, FigureId, GameState } from '../engine/types';
import type { RuleDefinition } from '../lang/ast';
import { START_RULES } from '../lang/library/startRules';
import { validateRule } from '../lang/validator';
import { evaluate } from './evaluate';

/** How many rounds the look-ahead plays. */
const LOOKAHEAD_ROUNDS = 2;
/** How many library rules are tried per decision (performance). */
const CANDIDATES = 5;
/** A rule must beat "no rule" by this many points. */
const MIN_GAIN = 1.5;

function enemiesOf(state: GameState, me: Figure): Figure[] {
  return Object.values(state.figures).filter((f) => {
    if (!f.alive || f.id === me.id) return false;
    if (me.kind === 'npc') return f.kind !== 'npc';
    if (me.kind === 'boss') return f.kind !== 'boss';
    return f.kind === 'boss' || f.kind === 'npc';
  });
}

/** One quick turn: walk towards the nearest enemy, attack if possible, else pass. */
function fastTurn(state: GameState): GameState {
  if (state.pendingVote) {
    let s = state;
    for (const voter of state.pendingVote.voters) {
      if (s.pendingVote?.votes[voter] || !s.pendingVote) continue;
      const r = applyAction(s, { type: 'voteRule', actor: voter, ruleId: chooseVote(s, voter) });
      if (r.ok) s = r.state;
    }
    return s;
  }
  const me = currentFigure(state);
  if (!me) return state;
  const tryAct = (s: GameState, a: Action): GameState => {
    const r = applyAction(s, a);
    return r.ok ? r.state : s;
  };
  if (me.kind === 'npc') return tryAct(state, { type: 'npcAct', actor: me.id });
  let s = state;
  if (s.turn.phase === 'move') {
    const enemies = enemiesOf(s, me);
    let best: { path: Action & { type: 'move' }; d: number } | null = null;
    for (const path of moveOptions(s, me.id).values()) {
      const end = path.at(-1) ?? me.pos;
      const d = Math.min(...enemies.map((e) => manhattan(e.pos, end)), 99);
      if (!best || d < best.d) best = { path: { type: 'move', actor: me.id, path }, d };
    }
    s = tryAct(s, best?.path ?? { type: 'move', actor: me.id, path: [] });
    if (currentFigure(s)?.id !== me.id || s.status !== 'playing') return s;
  }
  const target = attackTargets(s, me.id).find((t) => enemiesOf(s, me).some((e) => e.id === t.id));
  if (target) return tryAct(s, { type: 'attack', actor: me.id, target: target.id });
  return tryAct(s, { type: 'pass', actor: me.id });
}

function lookahead(state: GameState, me: FigureId): number {
  let s = state;
  const endRound = state.round + LOOKAHEAD_ROUNDS;
  for (let i = 0; i < 60 && s.status === 'playing' && s.round < endRound; i++) {
    const next = fastTurn(s);
    if (next === s) break;
    s = next;
  }
  return evaluate(s, me);
}

/** Library rules the running game accepts and that are not in play yet. */
export function candidateRules(state: GameState): RuleDefinition[] {
  const active = new Set(state.rules.map((r) => r.def.id));
  return START_RULES.filter(
    (r) => !active.has(r.id) && validateRule(r.ast, state.settings, state.npcTypes).length === 0,
  );
}

/** For "Ersteller wählt": drop the oldest rule of someone else, else the oldest. */
export function ruleToReplace(state: GameState, me: FigureId): string | undefined {
  const foreign = state.rules.filter((r) => r.authorId !== me);
  return (oldestRule(state, foreign.length > 0 ? foreign : state.rules) ?? undefined)?.id;
}

/** Vote: the oldest rule that the voter did not add, else the oldest. */
export function chooseVote(state: GameState, voter: FigureId): string {
  return ruleToReplace(state, voter) ?? state.rules[0]?.id ?? '';
}

/**
 * Picks a rule for the figure on turn (in its action phase), or null if no candidate
 * helps enough. `afterMove` is the state after the bot's move.
 */
export function chooseRule(afterMove: GameState, rng: RngHolder): Action | null {
  const me = currentFigure(afterMove);
  if (!me || me.kind === 'npc') return null;
  if (ruleSlotsFull(afterMove) && afterMove.settings.rules.overflow === 'blockNew') return null;
  const pool = [...candidateRules(afterMove)];
  const picked: RuleDefinition[] = [];
  while (picked.length < CANDIDATES && pool.length > 0) {
    const r = randomPick(rng, pool);
    if (!r) break;
    picked.push(r);
    pool.splice(pool.indexOf(r), 1);
  }
  if (picked.length === 0) return null;
  const pass = applyAction(afterMove, { type: 'pass', actor: me.id });
  const baseline = pass.ok ? lookahead(pass.state, me.id) : evaluate(afterMove, me.id);
  const replaceRuleId =
    ruleSlotsFull(afterMove) && afterMove.settings.rules.overflow === 'authorChooses'
      ? ruleToReplace(afterMove, me.id)
      : undefined;
  let best: { action: Action; gain: number } | null = null;
  for (const def of picked) {
    const action: Action = replaceRuleId
      ? { type: 'addRule', actor: me.id, rule: def, replaceRuleId }
      : { type: 'addRule', actor: me.id, rule: def };
    const r = applyAction(afterMove, action);
    if (!r.ok) continue;
    const gain = lookahead(r.state, me.id) - baseline;
    if (!best || gain > best.gain) best = { action, gain };
  }
  return best && best.gain >= MIN_GAIN ? best.action : null;
}
