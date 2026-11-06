// Read-only helpers over GameState, shared by reducer, bots and UI.
import { reachableTiles, samePos, tileKey } from './board';
import type { ActionType, Figure, FigureId, GameState, Percent, Pos, TileKey } from './types';

/** Hard protection limits (SPEC 6.2) – not configurable. */
export const MOVE_RANGE = { min: 0, max: 3 } as const;
export const WHEEL_RULE_RANGE = { min: 25, max: 75 } as const;

export function currentFigureId(state: GameState): FigureId | null {
  if (state.status === 'over') return null;
  return state.turn.order[state.turn.index] ?? null;
}

export function currentFigure(state: GameState): Figure | null {
  const id = currentFigureId(state);
  return id ? (state.figures[id] ?? null) : null;
}

export function getFigure(state: GameState, id: FigureId): Figure | undefined {
  return state.figures[id];
}

export function aliveFigures(state: GameState): Figure[] {
  return Object.values(state.figures).filter((f) => f.alive);
}

export function heroes(state: GameState): Figure[] {
  return state.seatOrder
    .map((id) => state.figures[id])
    .filter((f): f is Figure => f !== undefined && f.kind === 'hero');
}

export function boss(state: GameState): Figure | undefined {
  return Object.values(state.figures).find((f) => f.kind === 'boss');
}

export function effectiveMove(fig: Figure): number {
  let move = fig.baseMove;
  for (const s of fig.statuses) if (s.kind === 'moveMod') move += s.delta;
  return Math.min(MOVE_RANGE.max, Math.max(MOVE_RANGE.min, move));
}

/**
 * Base wheel chance for an attacker before the per-spin spread.
 * Rule modifiers are clamped to 25–75 %, but never push a base value
 * that lies outside that band further out (DECISIONS 2026-11-05).
 */
export function baseWheelChance(state: GameState, attacker: Figure): Percent {
  const base = state.settings.combat.wheelChance;
  let chance = base;
  for (const s of attacker.statuses) if (s.kind === 'wheelMod') chance += s.delta;
  const lo = Math.min(base, WHEEL_RULE_RANGE.min);
  const hi = Math.max(base, WHEEL_RULE_RANGE.max);
  return Math.min(hi, Math.max(lo, chance));
}

export function figuresAt(state: GameState, pos: Pos): Figure[] {
  return aliveFigures(state).filter((f) => samePos(f.pos, pos));
}

/** Figures the attacker may target right now (same tile, alive, friendly-fire rule). */
export function attackTargets(state: GameState, attackerId: FigureId): Figure[] {
  const attacker = state.figures[attackerId];
  if (!attacker || !attacker.alive) return [];
  return figuresAt(state, attacker.pos).filter((f) => {
    if (f.id === attacker.id) return false;
    if (!state.settings.combat.friendlyFire && attacker.kind === 'hero' && f.kind === 'hero') {
      return false;
    }
    return true;
  });
}

/** All tiles the current figure can reach this turn, with one shortest path each. */
export function moveOptions(state: GameState, figureId: FigureId): Map<TileKey, Pos[]> {
  const fig = state.figures[figureId];
  if (!fig) return new Map();
  return reachableTiles(state.tiles, fig.pos, effectiveMove(fig));
}

export type ActionAvailability = { available: true } | { available: false; reason: string };

/**
 * Whether an action type is possible for the current figure in the action phase.
 * `reason` is an i18n key for the disabled tooltip.
 */
export function actionAvailability(state: GameState, type: ActionType): ActionAvailability {
  const fig = currentFigure(state);
  if (!fig) return { available: false, reason: 'reason.gameOver' };
  switch (type) {
    case 'attack': {
      if (figuresAt(state, fig.pos).length <= 1)
        return { available: false, reason: 'reason.noTarget' };
      if (attackTargets(state, fig.id).length === 0) {
        return { available: false, reason: 'reason.friendlyFireOff' };
      }
      return { available: true };
    }
    case 'addTile':
    case 'removeTile':
      return { available: false, reason: 'reason.fromV02' };
    case 'addRule':
      return { available: false, reason: 'reason.fromV03' };
    case 'pass':
    case 'move':
      return { available: true };
  }
}

export function tileKeyOf(fig: Figure): TileKey {
  return tileKey(fig.pos);
}
