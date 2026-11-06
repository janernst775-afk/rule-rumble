import { describe, expect, it } from 'vitest';
import { makeGame } from '../../engine/__tests__/helpers';
import { applyAction } from '../../engine/reducer';
import type { GameState } from '../../engine/types';
import { START_RULES } from '../../lang/library/startRules';
import { candidateRules, chooseVote } from '../ruleChoice';
import { playBotGame, playBotTurn } from '../simulate';

describe('bots and rules', () => {
  it('candidates respect the game settings (random off)', () => {
    const s = makeGame(1, (st) => (st.rules.allowRandom = false));
    const ids = candidateRules(s).map((r) => r.id);
    expect(ids).not.toContain('start.zombie-land');
    expect(ids).toContain('start.lava-brennt');
  });

  it('vote for the oldest rule of someone else', () => {
    let s = makeGame(1);
    const add = (st: GameState, actor: string, i: number) => {
      const moved = applyAction(st, { type: 'move', actor, path: [] });
      if (!moved.ok) throw new Error();
      const r = applyAction(moved.state, { type: 'addRule', actor, rule: START_RULES[i]! });
      if (!r.ok) throw new Error(r.error.code);
      return r.state;
    };
    s = add(s, 'f1', 0);
    s = add(s, 'f2', 1);
    expect(chooseVote(s, 'f1')).toBe(s.rules[1]!.id);
    expect(chooseVote(s, 'f2')).toBe(s.rules[0]!.id);
  });

  it('bot games with votes and NPCs finish and stay deterministic', () => {
    const play = () => {
      let s = makeGame(
        3,
        (st) => {
          st.rules.maxActive = 2;
          st.rules.overflow = 'vote';
          st.rules.activationDelay = 0;
          st.tempo.roundLimit = { rounds: 40, outcome: 'draw' };
        },
        77,
      );
      // Start with two active rules so the next one triggers a vote.
      for (const i of [0, 3]) {
        const me = s.turn.order[s.turn.index]!;
        const moved = applyAction(s, { type: 'move', actor: me, path: [] });
        if (!moved.ok) throw new Error();
        const r = applyAction(moved.state, { type: 'addRule', actor: me, rule: START_RULES[i]! });
        if (!r.ok) throw new Error(r.error.code);
        s = r.state;
      }
      return playBotGame(s);
    };
    const a = play();
    expect(a.status).toBe('over');
    expect(JSON.stringify(play())).toBe(JSON.stringify(a));
  }, 60000);

  it('NPC turns are played by the bot loop', () => {
    let s = makeGame(1, (st) => (st.rules.activationDelay = 0));
    const moved = applyAction(s, { type: 'move', actor: 'f1', path: [] });
    if (!moved.ok) throw new Error();
    const zombieLand = { ...START_RULES[0]!, ast: { ...START_RULES[0]!.ast, conditions: [] } };
    const r = applyAction(moved.state, { type: 'addRule', actor: 'f1', rule: zombieLand });
    if (!r.ok) throw new Error(r.error.code);
    s = r.state;
    let sawNpcTurn = false;
    for (let i = 0; i < 30 && s.status === 'playing'; i++) {
      const id = s.turn.order[s.turn.index];
      if (id && s.figures[id]?.kind === 'npc') sawNpcTurn = true;
      s = playBotTurn(s);
    }
    expect(sawNpcTurn).toBe(true);
  });
});
