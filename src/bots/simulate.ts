import { applyAction } from '../engine/reducer';
import type { GameState } from '../engine/types';
import { chooseTurn } from './chooseTurn';

/** Executes one complete bot turn (move, then action) via applyAction only. */
export function playBotTurn(state: GameState): GameState {
  const turn = chooseTurn(state);
  if (!turn) return state;
  let s = state;
  if (s.turn.phase === 'move') {
    const moved = applyAction(s, { type: 'move', actor: turn.action.actor, path: turn.path });
    if (!moved.ok) throw new Error(`bot move rejected: ${moved.error.code}`);
    s = moved.state;
  }
  const acted = applyAction(s, turn.action);
  if (!acted.ok) throw new Error(`bot action rejected: ${acted.error.code}`);
  return acted.state;
}

/** Plays bots against each other until the game ends or `maxTurns` is reached. */
export function playBotGame(state: GameState, maxTurns = 5000): GameState {
  let s = state;
  for (let i = 0; i < maxTurns && s.status === 'playing'; i++) s = playBotTurn(s);
  return s;
}
