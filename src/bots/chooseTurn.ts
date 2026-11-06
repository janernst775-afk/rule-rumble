// Bot turn selection (SPEC 7, difficulty "normal"): try every move × action on a
// copy of the state via applyAction and pick the best expected score.
import { applyAction } from '../engine/reducer';
import {
  actionAvailability,
  attackTargets,
  baseWheelChance,
  currentFigure,
  moveOptions,
} from '../engine/query';
import { removableTiles, validAddPositions } from '../engine/tiles';
import { deriveRng, randomFloat, randomInt, type RngHolder } from '../engine/rng';
import type { Action, Figure, GameState, Pos } from '../engine/types';
import { evaluate } from './evaluate';

/** Tile actions must beat passing by this margin, so bots do not reshape the board for nothing. */
const TILE_ACTION_COST = 0.75;
/** Only the best move destinations are checked for tile actions (performance). */
const TILE_ACTION_MOVES = 3;

/** Chance of a random choice per difficulty (easy/hard become available in v0.8). */
const RANDOMNESS = { easy: 0.4, normal: 0.15, hard: 0.15 } as const;

export interface BotTurn {
  path: Pos[];
  action: Action;
}

interface Candidate extends BotTurn {
  score: number;
}

function damaged(state: GameState, targetId: string): GameState {
  const t = state.figures[targetId];
  if (!t) return state;
  const hp = Math.max(0, t.hp - 1);
  return {
    ...state,
    figures: { ...state.figures, [targetId]: { ...t, hp, alive: hp > 0 } },
  };
}

function hasShield(fig: Figure): boolean {
  return fig.statuses.some((s) => s.kind === 'shield');
}

function attackAllowedByBotPolicy(
  state: GameState,
  me: Figure,
  target: Figure,
  rng: RngHolder,
): boolean {
  // Hero bots attack other heroes only rarely (chaos value, SPEC 7).
  if (me.kind === 'hero' && target.kind === 'hero') {
    return randomFloat(rng) * 100 < state.settings.bots.heroChaos;
  }
  return true;
}

function candidatesFor(state: GameState, me: Figure, rng: RngHolder): Candidate[] {
  const out: Candidate[] = [];
  const chaosAllowed = new Map<string, boolean>();
  const afterMoves: { path: Pos[]; after: GameState }[] = [];
  if (state.turn.phase === 'action') {
    afterMoves.push({ path: [], after: state });
  } else {
    for (const path of moveOptions(state, me.id).values()) {
      const moved = applyAction(state, { type: 'move', actor: me.id, path });
      if (moved.ok) afterMoves.push({ path, after: moved.state });
    }
  }
  const scored = afterMoves.map((m) => ({ ...m, base: evaluate(m.after, me.id) }));
  for (const { path, after, base } of scored) {
    out.push({ path, action: { type: 'pass', actor: me.id }, score: base });
    const meAfter = after.figures[me.id];
    if (!meAfter) continue;
    const p = baseWheelChance(after, meAfter) / 100;
    for (const target of attackTargets(after, me.id)) {
      if (!chaosAllowed.has(target.id)) {
        chaosAllowed.set(target.id, attackAllowedByBotPolicy(after, me, target, rng));
      }
      if (!chaosAllowed.get(target.id)) continue;
      const hitScore = hasShield(target) ? base : evaluate(damaged(after, target.id), me.id);
      // Small bonus so that attacking beats an equal-valued pass.
      const score = p * hitScore + (1 - p) * base + 0.5;
      out.push({ path, action: { type: 'attack', actor: me.id, target: target.id }, score });
    }
  }
  const best = [...scored].sort((a, b) => b.base - a.base).slice(0, TILE_ACTION_MOVES);
  for (const { path, after } of best) out.push(...tileCandidates(after, me, path));
  return out;
}

function tileCandidates(after: GameState, me: Figure, path: Pos[]): Candidate[] {
  const out: Candidate[] = [];
  const tryAction = (action: Action) => {
    const result = applyAction(after, action);
    if (result.ok)
      out.push({ path, action, score: evaluate(result.state, me.id) - TILE_ACTION_COST });
  };
  if (actionAvailability(after, 'addTile').available) {
    for (const pos of validAddPositions(after)) {
      tryAction({ type: 'addTile', actor: me.id, pos, textureId: null });
    }
  }
  if (actionAvailability(after, 'removeTile').available) {
    for (const pos of removableTiles(after)) tryAction({ type: 'removeTile', actor: me.id, pos });
  }
  return out;
}

/** Chooses the full turn (move + action) for the figure currently on turn. */
export function chooseTurn(state: GameState): BotTurn | null {
  const me = currentFigure(state);
  if (!me) return null;
  const rng: RngHolder = {
    rng: deriveRng(state.rng, `${me.id}:${state.round}:${state.turn.index}`),
  };
  const candidates = candidatesFor(state, me, rng);
  if (candidates.length === 0) return { path: [], action: { type: 'pass', actor: me.id } };

  const difficulty = state.participants[me.id]?.difficulty ?? 'normal';
  if (randomFloat(rng) < RANDOMNESS[difficulty]) {
    const pick = candidates[randomInt(rng, candidates.length)];
    if (pick) return { path: pick.path, action: pick.action };
  }

  let best = candidates[0]!;
  const ties: Candidate[] = [];
  for (const c of candidates) {
    if (c.score > best.score + 1e-9) {
      best = c;
      ties.length = 0;
      ties.push(c);
    } else if (Math.abs(c.score - best.score) <= 1e-9) {
      ties.push(c);
    }
  }
  const chosen = ties.length > 1 ? (ties[randomInt(rng, ties.length)] ?? best) : best;
  return { path: chosen.path, action: chosen.action };
}

/** The move action for a bot turn. */
export function moveActionOf(state: GameState, turn: BotTurn): Action {
  const me = currentFigure(state);
  return { type: 'move', actor: me?.id ?? '', path: turn.path };
}
