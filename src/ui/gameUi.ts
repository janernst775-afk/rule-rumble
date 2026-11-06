import type { FigureId, GameState, LogEntry } from '../engine/types';

const FIGURE_PARAMS = new Set(['figure', 'attacker', 'target']);

export function nameOf(state: GameState, id: FigureId): string {
  return state.participants[id]?.name ?? id;
}

/** Replaces figure ids in log/toast params with display names. */
export function displayParams(
  state: GameState,
  params: LogEntry['params'],
): Record<string, string | number> {
  const out: Record<string, string | number> = {};
  for (const [k, v] of Object.entries(params)) {
    out[k] = FIGURE_PARAMS.has(k) && typeof v === 'string' ? nameOf(state, v) : v;
  }
  return out;
}

export function isHumanTurn(state: GameState): boolean {
  if (state.status !== 'playing') return false;
  const id = state.turn.order[state.turn.index];
  return id !== undefined && state.participants[id]?.controller === 'human';
}

export const TILE = 64;
export const GAP = 10;
export const PITCH = TILE + GAP;
