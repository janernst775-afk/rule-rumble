import { describe, expect, it } from 'vitest';
import { makeGame } from '../../engine/__tests__/helpers';
import { applyAction } from '../../engine/reducer';
import type { Difficulty, GameState } from '../../engine/types';
import { parseRule } from '../../lang/parser';
import { chooseTurn } from '../chooseTurn';
import { candidateRules } from '../ruleChoice';
import { playBotTurn } from '../simulate';

function withDifficulty(state: GameState, d: Difficulty): GameState {
  const participants = Object.fromEntries(
    Object.entries(state.participants).map(([id, p]) => [id, { ...p, difficulty: d }]),
  );
  return { ...state, participants };
}

// Bot searches are slow; give them time when the whole suite runs in parallel.
const SLOW = 30_000;

describe('bot difficulties (SPEC 7)', () => {
  it('all difficulties play legal turns', () => {
    for (const d of ['easy', 'normal', 'hard'] as const) {
      let s = withDifficulty(makeGame(2, undefined, 11), d);
      for (let i = 0; i < 12 && s.status === 'playing'; i++) s = playBotTurn(s);
      expect(s.round).toBeGreaterThan(1);
    }
  }, SLOW);

  it('Leicht acts randomly more often than Normal', () => {
    const differs = (d: Difficulty) => {
      let n = 0;
      for (let seed = 1; seed <= 30; seed++) {
        const base = makeGame(2, undefined, seed);
        const a = chooseTurn(withDifficulty(base, 'hard'));
        const b = chooseTurn(withDifficulty(base, d));
        if (JSON.stringify(a) !== JSON.stringify(b)) n++;
      }
      return n;
    };
    expect(differs('easy')).toBeGreaterThan(differs('normal'));
  }, SLOW);

  it('Schwer may bring own library rules, Leicht and Normal only start rules', () => {
    const own = {
      id: 'own.mut',
      author: 'Jan',
      ast: parseRule('REGEL "Mut"\nWENN TREFFER\nDANN HEILE angreifer 1').rule!.ast,
    };
    const s = makeGame(2);
    expect(candidateRules(s, [own]).some((r) => r.id === 'own.mut')).toBe(true);
    expect(candidateRules(s).some((r) => r.id === 'own.mut')).toBe(false);
    // A hard bot's turn with extra rules is still legal.
    const hard = withDifficulty(s, 'hard');
    const turn = chooseTurn(hard, { extraRules: [own] });
    const moved = applyAction(hard, { type: 'move', actor: 'f1', path: turn!.path });
    expect(moved.ok).toBe(true);
  }, SLOW);
});
