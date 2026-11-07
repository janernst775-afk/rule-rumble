import { applyAction } from '../engine/reducer';
import type { GameState } from '../engine/types';
import { chooseTurn, type BotOptions } from './chooseTurn';
import { chooseVote } from './ruleChoice';

/** Lets every bot voter cast its vote (overflow "Abstimmung"). */
export function playBotVotes(state: GameState): GameState {
  let s = state;
  const vote = s.pendingVote;
  if (!vote) return s;
  for (const voter of vote.voters) {
    if (!s.pendingVote || s.pendingVote.votes[voter]) continue;
    if (s.participants[voter]?.controller === 'human') continue;
    const r = applyAction(s, { type: 'voteRule', actor: voter, ruleId: chooseVote(s, voter) });
    if (!r.ok) throw new Error(`bot vote rejected: ${r.error.code}`);
    s = r.state;
  }
  return s;
}

/** Executes one complete bot turn (move, then action) via applyAction only. */
export function playBotTurn(state: GameState, opts: BotOptions = {}): GameState {
  if (state.pendingVote) return playBotVotes(state);
  const turn = chooseTurn(state, opts);
  if (!turn) return state;
  let s = state;
  if (s.turn.phase === 'move' && turn.action.type !== 'npcAct') {
    const moved = applyAction(s, { type: 'move', actor: turn.action.actor, path: turn.path });
    if (!moved.ok) throw new Error(`bot move rejected: ${moved.error.code}`);
    s = moved.state;
    // A rule may have ended the turn during the walk.
    if (s.status !== 'playing' || !isSameTurn(state, s)) return s;
  }
  const acted = applyAction(s, turn.action);
  if (!acted.ok) throw new Error(`bot action rejected: ${acted.error.code}`);
  if (acted.state.pendingVote) return playBotVotes(acted.state);
  // "Tile actions count double": the same figure may still be in its action phase.
  if (isSameTurn(s, acted.state)) return playBotTurn(acted.state, opts);
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
