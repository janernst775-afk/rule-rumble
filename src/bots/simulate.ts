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
  // "Tile actions count double": the same figure may still be in its action phase.
  if (isSameTurn(s, acted.state)) return playBotTurn(acted.state);
  return acted.state;
}

/** Plays bots against each other until the game ends or `maxTurns` is reached. */
export function playBotGame(state: GameState, maxTurns = 5000): GameState {
  let s = state;
  for (let i = 0; i < maxTurns && s.status === 'playing'; i++) s = playBotTurn(s);
  return s;
}

/** True if the figure that just acted is still on turn (second tile action pending). */
export function isSameTurn(before: GameState, after: GameState): boolean {
  return (
    after.status === 'playing' &&
    after.round === before.round &&
    after.turn.index === before.turn.index &&
    after.turn.phase === 'action'
  );
}
