import { describe, expect, it } from 'vitest';
import type { RuleDefinition } from '../../lang/ast';
import { fx, on, rule, where, who, x } from '../../lang/build';
import { actionAvailability, currentFigureId } from '../query';
import { applyAction } from '../reducer';
import type { Action, ApplyResult, GameState, Settings } from '../types';
import { makeGame, place } from './helpers';

function ok(result: ApplyResult): GameState {
  if (!result.ok) throw new Error(`expected ok, got ${result.error.code}`);
  return result.state;
}
function code(result: ApplyResult): string | null {
  return result.ok ? null : result.error.code;
}
function run(state: GameState, ...actions: Action[]): GameState {
  return actions.reduce((s, a) => ok(applyAction(s, a)), state);
}
const stay = (actor: string): Action => ({ type: 'move', actor, path: [] });
const pass = (actor: string): Action => ({ type: 'pass', actor });

function counterRule(name: string): RuleDefinition {
  return {
    id: `test.${name}`,
    author: 'Test',
    ast: rule(name, on.roundStart(), { then: [fx.setWorld(name.toLowerCase(), '+', x.num(1))] }),
  };
}
const add = (actor: string, def: RuleDefinition, replaceRuleId?: string): Action =>
  replaceRuleId
    ? { type: 'addRule', actor, rule: def, replaceRuleId }
    : { type: 'addRule', actor, rule: def };

/** Adds rules A, B, … for f1 in consecutive rounds (1 hero + boss). */
function withAddedRules(patch: (s: Settings) => void, names: string[]): GameState {
  let s = makeGame(1, patch);
  for (const n of names) s = run(s, stay('f1'), add('f1', counterRule(n)), pass('f2'));
  return s;
}

describe('addRule', () => {
  it('becomes active at the next round start by default (SPEC 6.1)', () => {
    let s = run(makeGame(1), stay('f1'), add('f1', counterRule('A')));
    expect(s.rules).toHaveLength(1);
    expect(s.rules[0]?.activeFromRound).toBe(2);
    expect(currentFigureId(s)).toBe('f2');
    s = run(s, pass('f2'));
    expect(s.world.a).toBe(1);
  });

  it('activation delay "sofort" and "in 2 Runden"', () => {
    const now = run(
      makeGame(1, (st) => (st.rules.activationDelay = 0)),
      stay('f1'),
      {
        type: 'addRule',
        actor: 'f1',
        rule: {
          id: 't',
          author: 'T',
          ast: rule('Jetzt', on.turnStart(), { then: [fx.setWorld('j', '+', x.num(1))] }),
        },
      },
    );
    expect(now.world.j).toBe(1); // fires at the boss's turn start in the same round
    let later = run(
      makeGame(1, (st) => (st.rules.activationDelay = 2)),
      stay('f1'),
      add('f1', counterRule('L')),
    );
    later = run(later, pass('f2'), pass('f1'), pass('f2'));
    expect(later.world.l).toBe(1); // round 3 only
  });

  it('DAUER counts from activation', () => {
    const def: RuleDefinition = {
      ...counterRule('D'),
      ast: { ...counterRule('D').ast, duration: 2 },
    };
    let s = run(makeGame(1), stay('f1'), add('f1', def), pass('f2'));
    for (let i = 0; i < 4; i++) s = run(s, pass('f1'), pass('f2'));
    expect(s.world.d).toBe(2);
    expect(s.rules).toHaveLength(0);
  });

  it('rejects invalid rules and other phases', () => {
    const bad: RuleDefinition = {
      id: 'bad',
      author: 'x',
      ast: rule('Bad', on.roundStart(), { then: [fx.damage(who.trigger)] }),
    };
    const s = run(makeGame(1), stay('f1'));
    expect(code(applyAction(s, add('f1', bad)))).toBe('invalidRule');
    expect(code(applyAction(makeGame(1), add('f1', counterRule('A'))))).toBe('wrongPhase');
  });

  it('validates against the running game (random off)', () => {
    const s = run(
      makeGame(1, (st) => (st.rules.allowRandom = false)),
      stay('f1'),
    );
    const randomRule: RuleDefinition = {
      id: 'r',
      author: 'x',
      ast: rule('R', on.roundStart(), { then: [fx.shield(who.random)] }),
    };
    expect(code(applyAction(s, add('f1', randomRule)))).toBe('invalidRule');
  });
});

describe('overflow variants (SPEC 2.2)', () => {
  const max2 = (overflow: Settings['rules']['overflow']) => (s: Settings) => {
    s.rules.maxActive = 2;
    s.rules.overflow = overflow;
  };

  it('dropOldest: the oldest rule goes', () => {
    const s = withAddedRules(max2('dropOldest'), ['A', 'B', 'C']);
    expect(s.rules.map((r) => r.def.ast.name)).toEqual(['B', 'C']);
  });

  it('blockNew: no new rule while full', () => {
    let s = withAddedRules(max2('blockNew'), ['A', 'B']);
    s = run(s, stay('f1'));
    expect(actionAvailability(s, 'addRule')).toMatchObject({ available: false });
    expect(code(applyAction(s, add('f1', counterRule('C'))))).toBe('ruleLimitReached');
  });

  it('authorChooses: the author picks which rule goes', () => {
    let s = withAddedRules(max2('authorChooses'), ['A', 'B']);
    s = run(s, stay('f1'));
    expect(code(applyAction(s, add('f1', counterRule('C'))))).toBe('chooseRuleToReplace');
    const b = s.rules.find((r) => r.def.ast.name === 'B')!;
    s = run(s, add('f1', counterRule('C'), b.id));
    expect(s.rules.map((r) => r.def.ast.name)).toEqual(['A', 'C']);
  });

  it('vote: all living heroes and the boss vote; majority, tie → oldest', () => {
    let s = withAddedRules(
      (st) => {
        st.rules.maxActive = 2;
        st.rules.overflow = 'vote';
      },
      ['A', 'B'],
    );
    s = run(s, stay('f1'), add('f1', counterRule('C')));
    expect(s.pendingVote?.voters).toEqual(['f1', 'f2']);
    expect(currentFigureId(s)).toBe('f1');
    expect(code(applyAction(s, pass('f1')))).toBe('votePending');
    const [a, b] = s.rules;
    // tie (one vote each) → oldest (A) goes
    s = run(
      s,
      { type: 'voteRule', actor: 'f2', ruleId: b!.id },
      { type: 'voteRule', actor: 'f1', ruleId: a!.id },
    );
    expect(s.pendingVote).toBeNull();
    expect(s.rules.map((r) => r.def.ast.name)).toEqual(['B', 'C']);
    expect(currentFigureId(s)).toBe('f2');
  });

  it('vote: majority wins and double votes are rejected', () => {
    let s = makeGame(2, (st) => {
      st.rules.maxActive = 2;
      st.rules.overflow = 'vote';
    });
    s = run(
      s,
      stay('f1'),
      add('f1', counterRule('A')),
      stay('f2'),
      add('f2', counterRule('B')),
      pass('f3'),
    );
    s = run(s, stay('f1'), add('f1', counterRule('C')));
    const b = s.rules[1]!;
    s = run(s, { type: 'voteRule', actor: 'f1', ruleId: b.id });
    expect(code(applyAction(s, { type: 'voteRule', actor: 'f1', ruleId: b.id }))).toBe(
      'alreadyVoted',
    );
    s = run(
      s,
      { type: 'voteRule', actor: 'f2', ruleId: b.id },
      { type: 'voteRule', actor: 'f3', ruleId: s.rules[0]!.id },
    );
    expect(s.rules.map((r) => r.def.ast.name)).toEqual(['A', 'C']);
  });
});

describe('NPCs', () => {
  function withZombie(state: GameState, x1: number, y1: number): GameState {
    const z = {
      id: 'f9',
      kind: 'npc' as const,
      npcTypeId: 'zombie',
      pos: { x: x1, y: y1 },
      hp: 1,
      maxHp: 1,
      baseMove: 1,
      vars: {},
      statuses: [],
      alive: true,
      joinedRound: 0,
    };
    return {
      ...state,
      figures: { ...state.figures, f9: z },
      participants: {
        ...state.participants,
        f9: {
          figureId: 'f9',
          name: 'Zombie',
          avatar: { image: null, color: '#4B6B2E' },
          controller: 'npc',
          difficulty: null,
        },
      },
      stats: { ...state.stats, f9: { ...state.stats.f1! } },
    };
  }

  it('act after the boss, in order of appearance, from the next round on', () => {
    let s = withZombie(makeGame(1), 3, 3);
    s = run(s, pass('f1'), pass('f2'));
    expect(s.turn.order).toEqual(['f1', 'f2', 'f9']);
    s = run(s, pass('f1'), pass('f2'));
    expect(currentFigureId(s)).toBe('f9');
    expect(code(applyAction(s, pass('f9')))).toBe('npcActsAlone');
  });

  it('chase the nearest figure and attack on the same tile', () => {
    let s = withZombie(makeGame(1), 1, 1);
    s = { ...s, settings: { ...s.settings, combat: { ...s.settings.combat, wheelChance: 100 } } };
    s = run(s, pass('f1'), pass('f2'), pass('f1'), pass('f2'));
    s = run(s, { type: 'npcAct', actor: 'f9' });
    // moved one step towards the hero on (0,0)
    expect([1, 0].includes(s.figures.f9!.pos.x + s.figures.f9!.pos.y - 1)).toBe(true);
    s = place(s, 'f9', 0, 0);
    s = run(s, pass('f1'), pass('f2'));
    const before = s.figures.f1!.hp;
    s = run(s, { type: 'npcAct', actor: 'f9' });
    expect(s.figures.f1!.hp).toBe(before - 1);
  });

  it('spawned by a rule only act from the next round on', () => {
    const zombieLand: RuleDefinition = {
      id: 'z',
      author: 'T',
      ast: rule('Zombie', on.enters(true), { then: [fx.spawn('zombie', where.tile)] }),
    };
    let s = run(
      makeGame(1, (st) => (st.rules.activationDelay = 0)),
      stay('f1'),
      add('f1', zombieLand),
    );
    s = run(s, { type: 'move', actor: 'f2', path: [{ x: 4, y: 5 }] });
    const npc = Object.values(s.figures).find((f) => f.kind === 'npc');
    expect(npc?.pos).toEqual({ x: 4, y: 5 });
    expect(s.turn.order).not.toContain(npc!.id);
    s = run(s, pass('f2'));
    expect(s.turn.order).toContain(npc!.id);
  });

  it('NPC deaths do not decide the game', () => {
    let s = withZombie(makeGame(1), 0, 0);
    s = { ...s, settings: { ...s.settings, combat: { ...s.settings.combat, wheelChance: 100 } } };
    s = run(s, stay('f1'), { type: 'attack', actor: 'f1', target: 'f9' });
    expect(s.figures.f9?.alive).toBe(false);
    expect(s.status).toBe('playing');
  });
});
