import { describe, expect, it } from 'vitest';
import { applyAction } from '../../engine/reducer';
import { makeGame, place } from '../../engine/__tests__/helpers';
import { chooseTurn } from '../chooseTurn';
import { playBotGame } from '../simulate';
import type { GameState } from '../../engine/types';

function passed(state: GameState, actor: string): GameState {
  const r = applyAction(state, { type: 'pass', actor });
  if (!r.ok) throw new Error(r.error.code);
  return r.state;
}

describe('bots', () => {
  it('produce legal turns', () => {
    const s = makeGame(2);
    const turn = chooseTurn(s);
    expect(turn).not.toBeNull();
    const moved = applyAction(s, { type: 'move', actor: 'f1', path: turn!.path });
    expect(moved.ok).toBe(true);
  });

  it('boss attacks a hero standing on its tile', () => {
    let hits = 0;
    for (let seed = 1; seed <= 20; seed++) {
      let s = makeGame(1, undefined, seed);
      s = place(place(s, 'f2', 3, 3), 'f1', 3, 3);
      s = passed(s, 'f1');
      const turn = chooseTurn(s);
      if (turn?.action.type === 'attack') hits++;
    }
    // 15 % randomness allowed; the boss should attack in the clear majority of cases.
    expect(hits).toBeGreaterThanOrEqual(14);
  });

  it('boss approaches the heroes', () => {
    const s0 = makeGame(1);
    const s1 = passed(s0, 'f1');
    let closer = 0;
    for (let seed = 1; seed <= 20; seed++) {
      const s = { ...s1, rng: seed };
      const turn = chooseTurn(s);
      const end = turn?.path.at(-1) ?? s.figures.f2!.pos;
      if (end.x + end.y < 10) closer++;
    }
    expect(closer).toBeGreaterThanOrEqual(14);
  });

  it('bot-vs-bot games finish', () => {
    const end = playBotGame(
      makeGame(3, (st) => (st.tempo.roundLimit = { rounds: 100, outcome: 'draw' }), 7),
    );
    expect(end.status).toBe('over');
    expect(end.result).not.toBeNull();
  });

  it('are deterministic: same seed => identical end state', () => {
    const play = () =>
      playBotGame(
        makeGame(3, (st) => (st.tempo.roundLimit = { rounds: 100, outcome: 'draw' }), 1234),
      );
    const a = play();
    const b = play();
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(a.status).toBe('over');
  });

  it('different seeds lead to different games', () => {
    const play = (seed: number) =>
      playBotGame(
        makeGame(2, (st) => (st.tempo.roundLimit = { rounds: 100, outcome: 'draw' }), seed),
      );
    expect(JSON.stringify(play(1))).not.toBe(JSON.stringify(play(2)));
  });
});
