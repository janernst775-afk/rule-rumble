import { describe, expect, it } from 'vitest';
import { TEMPLATES } from '../../engine/settings';
import { DEFAULT_SIM, simulateGame, summarize } from '../simulation';

describe('balance simulation (SPEC 6.3)', () => {
  it('plays "Baumeister" games without illegal bot actions (attack after a tile action)', () => {
    for (let seed = 100_000; seed < 100_004; seed++) {
      const s = simulateGame(TEMPLATES.builder, 'builder', seed, { ...DEFAULT_SIM, maxTurns: 80 });
      expect(s.round).toBeGreaterThan(1);
    }
  }, 60_000);

  it('is deterministic for a seed', () => {
    const a = simulateGame(TEMPLATES.classic, 'classic', 7, { ...DEFAULT_SIM, maxTurns: 40 });
    const b = simulateGame(TEMPLATES.classic, 'classic', 7, { ...DEFAULT_SIM, maxTurns: 40 });
    expect(a).toEqual(b);
  }, 30_000);

  it('summarizes batches into a boss win rate', () => {
    const r = summarize('classic', 10, [
      { bossWins: 3, heroWins: 2, draws: 0, unfinished: 0, rounds: 50 },
      { bossWins: 1, heroWins: 3, draws: 0, unfinished: 1, rounds: 40 },
    ]);
    expect(r.bossRate).toBeCloseTo(4 / 9);
    expect(r.avgRounds).toBe(10);
  });
});
