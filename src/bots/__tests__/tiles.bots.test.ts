import { describe, expect, it } from 'vitest';
import { makeGame, place } from '../../engine/__tests__/helpers';
import { applyAction } from '../../engine/reducer';
import type { GameState } from '../../engine/types';
import { chooseTurn } from '../chooseTurn';
import { walkDistance } from '../evaluate';
import { playBotGame } from '../simulate';

function bossTurn(state: GameState): GameState {
  let s = state;
  for (const id of s.seatOrder.filter((id) => s.figures[id]?.kind === 'hero')) {
    const r = applyAction(s, { type: 'pass', actor: id });
    if (!r.ok) throw new Error(r.error.code);
    s = r.state;
  }
  return s;
}

describe('bots and tiles', () => {
  it('the boss removes a shortcut tile to separate the heroes (board stays connected)', () => {
    // 6x3 board; heroes at (2,0) and (4,0) are 2 apart via (3,0), 4 apart without it.
    let s = makeGame(2, (st) => (st.board.minTiles = 8));
    const tiles: GameState['tiles'] = {};
    for (const key of Object.keys(s.tiles)) {
      const [, y] = key.split(',').map(Number);
      if (y! <= 2) tiles[key] = s.tiles[key]!;
    }
    s = { ...s, tiles };
    s = place(place(place(s, 'f1', 2, 0), 'f2', 4, 0), 'f3', 0, 2);
    s = bossTurn(s);
    let removals = 0;
    for (let seed = 1; seed <= 20; seed++) {
      const turn = chooseTurn({ ...s, rng: seed });
      if (turn?.action.type === 'removeTile') {
        const moved = applyAction(
          { ...s, rng: seed },
          { type: 'move', actor: 'f3', path: turn.path },
        );
        const after = moved.ok ? applyAction(moved.state, turn.action) : moved;
        if (after.ok && walkDistance(after.state, { x: 2, y: 0 }, { x: 4, y: 0 }) > 2) removals++;
      }
    }
    expect(removals).toBeGreaterThanOrEqual(14);
  });

  it('bot-vs-bot games with double tile actions still finish deterministically', () => {
    const play = () =>
      playBotGame(
        makeGame(
          3,
          (st) => {
            st.board.tileActionsPerAction = 2;
            st.board.maxTiles = 100;
            st.tempo.roundLimit = { rounds: 60, outcome: 'draw' };
          },
          99,
        ),
      );
    const a = play();
    expect(a.status).toBe('over');
    expect(JSON.stringify(play())).toBe(JSON.stringify(a));
  }, 60000);
});
