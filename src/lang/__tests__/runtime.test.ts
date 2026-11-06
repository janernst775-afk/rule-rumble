import { describe, expect, it } from 'vitest';
import { makeGame, place, setHp } from '../../engine/__tests__/helpers';
import { applyAction } from '../../engine/reducer';
import type { Action, ApplyResult, GameState } from '../../engine/types';
import { fx, on, rule, where, who, x } from '../build';
import { withRules } from './helpers';

function ok(result: ApplyResult): GameState {
  if (!result.ok) throw new Error(`expected ok, got ${result.error.code}`);
  return result.state;
}
function run(state: GameState, ...actions: Action[]): GameState {
  return actions.reduce((s, a) => ok(applyAction(s, a)), state);
}
const stay = (actor: string): Action => ({ type: 'move', actor, path: [] });
const pass = (actor: string): Action => ({ type: 'pass', actor });
const step = (actor: string, x1: number, y1: number): Action => ({
  type: 'move',
  actor,
  path: [{ x: x1, y: y1 }],
});

describe('runtime: triggers and context', () => {
  it('BETRITT feld fires per step with feld and von_feld', () => {
    let s = withRules(
      makeGame(1),
      rule('Lava', on.enters(), {
        when: [x.cmp(x.tileType(), '=', x.str('lava'))],
        then: [fx.damage(who.trigger)],
      }),
    );
    s = { ...s, tiles: { ...s.tiles, '1,0': { ...s.tiles['1,0']!, type: 'lava' } } };
    s = run(s, step('f1', 1, 0));
    expect(s.figures.f1?.hp).toBe(2);
  });

  it('BETRITT neues_feld only fires on the first visit', () => {
    let s = withRules(
      makeGame(1),
      rule('Neu', on.enters(true), { then: [fx.setWorld('n', '+', x.num(1))] }),
    );
    s = run(s, step('f1', 1, 0), pass('f1'), pass('f2'), step('f1', 0, 0), pass('f1'), pass('f2'));
    s = run(s, step('f1', 1, 0));
    // (1,0) new, (0,0) start tile already visited, (1,0) again not new
    expect(s.world.n).toBe(1);
  });

  it('RUNDENSTART, RUNDENENDE and ALLE N RUNDEN', () => {
    let s = withRules(
      makeGame(1),
      rule('S', on.roundStart(), { then: [fx.setWorld('s', '+', x.num(1))] }),
      rule('E', on.roundEnd(), { then: [fx.setWorld('e', '+', x.num(1))] }),
      rule('N', on.everyNRounds(2), { then: [fx.setWorld('n', '+', x.num(1))] }),
    );
    for (let i = 0; i < 4; i++) s = run(s, pass('f1'), pass('f2'));
    // rounds 2..5 started, rounds 1..4 ended, even rounds 2 and 4
    expect(s.world).toMatchObject({ s: 4, e: 4, n: 2 });
  });

  it('TREFFER / FEHLSCHLAG provide angreifer and ziel', () => {
    let s = withRules(
      place(makeGame(1), 'f2', 0, 0),
      rule('Rückenwind', on.hit(), { then: [fx.move(who.attacker, 1, 1)] }),
      rule('Pech', on.miss(), { then: [fx.setVar(who.target, 'glueck', '+', x.num(1))] }),
    );
    s = { ...s, settings: { ...s.settings, combat: { ...s.settings.combat, wheelChance: 100 } } };
    s = run(s, stay('f1'), { type: 'attack', actor: 'f1', target: 'f2' });
    expect(s.figures.f1?.statuses.some((st) => st.kind === 'moveMod')).toBe(true);
  });

  it('SCHADEN provides menge; STIRBT provides feld', () => {
    let s = withRules(
      setHp(place(makeGame(2), 'f3', 0, 0), 'f2', 1),
      rule('Seelen', on.dies(), { then: [fx.setVar(who.neighbors, 'seelen', '+', x.num(1))] }),
      rule('Menge', on.damage(), { then: [fx.setWorld('dmg', '+', x.amount)] }),
    );
    s = place(s, 'f2', 1, 0);
    s = { ...s, settings: { ...s.settings, combat: { ...s.settings.combat, wheelChance: 100 } } };
    // f1 attacks f2 on (1,0): move there first
    s = run(s, step('f1', 1, 0), { type: 'attack', actor: 'f1', target: 'f2' });
    expect(s.figures.f2?.alive).toBe(false);
    expect(s.world.dmg).toBe(1);
    // neighbours of (1,0): f3 at (0,0) collects a soul
    expect(s.figures.f3?.vars.seelen).toBe(1);
  });

  it('SONST runs when conditions fail', () => {
    let s = withRules(
      makeGame(1),
      rule('Flut', on.roundEnd(), {
        when: [x.cmp(x.world('flut'), '>=', x.num(2))],
        then: [fx.setWorld('flut', '=', x.num(0)), fx.setWorld('wellen', '+', x.num(1))],
        otherwise: [fx.setWorld('flut', '+', x.num(1))],
      }),
    );
    for (let i = 0; i < 3; i++) s = run(s, pass('f1'), pass('f2'));
    expect(s.world).toMatchObject({ flut: 0, wellen: 1 });
  });

  it('rules react in the order they were added', () => {
    let s = withRules(
      makeGame(1),
      rule('A', on.roundStart(), { then: [fx.setWorld('v', '=', x.num(1))] }),
      rule('B', on.roundStart(), { then: [fx.setWorld('v', '+', x.num(10))] }),
    );
    s = run(s, pass('f1'), pass('f2'));
    expect(s.world.v).toBe(11);
  });

  it('rules apply to everyone alike, including the boss', () => {
    let s = withRules(makeGame(1), rule('Gift', on.roundStart(), { then: [fx.damage(who.all)] }));
    s = run(s, pass('f1'), pass('f2'));
    expect(s.figures.f1?.hp).toBe(2);
    expect(s.figures.f2?.hp).toBe(3);
  });
});

describe('runtime: limits', () => {
  it('LIMIT n PRO RUNDE / ZUG / SPIEL', () => {
    const counter = (per: 'round' | 'turn' | 'game') =>
      rule(per, on.enters(), {
        then: [fx.setWorld(per, '+', x.num(1))],
        limit: { count: 1, per },
      });
    let s = withRules(
      makeGame(1, (st) => (st.figures.heroMove = 2)),
      counter('round'),
      counter('turn'),
      counter('game'),
    );
    s = run(
      s,
      {
        type: 'move',
        actor: 'f1',
        path: [
          { x: 1, y: 0 },
          { x: 2, y: 0 },
        ],
      },
      pass('f1'),
    );
    s = run(s, { type: 'move', actor: 'f2', path: [{ x: 4, y: 5 }] }, pass('f2'));
    s = run(s, { type: 'move', actor: 'f1', path: [{ x: 3, y: 0 }] }, pass('f1'));
    // round: 1 in round 1, 1 in round 2; turn: f1, f2, f1; game: 1
    expect(s.world).toMatchObject({ round: 2, turn: 3, game: 1 });
  });

  it('DAUER: the rule leaves the game after n rounds', () => {
    let s = withRules(makeGame(1), {
      ...rule('Kurz', on.roundStart(), { then: [fx.setWorld('k', '+', x.num(1))] }),
      duration: 2,
    });
    s = { ...s, rules: s.rules.map((r) => ({ ...r, activeFromRound: 1, expiresAfterRound: 2 })) };
    for (let i = 0; i < 4; i++) s = run(s, pass('f1'), pass('f2'));
    expect(s.world.k).toBe(1); // only the start of round 2 (round 1 started before the rule)
    expect(s.rules).toHaveLength(0);
  });

  it('chain reactions stop at depth 3', () => {
    // Every damage causes damage to everyone: an endless chain without the limit.
    let s = withRules(
      makeGame(1, (st) => (st.rules.ruleDamagePerFigurePerRound = 5)),
      rule('Kette', on.damage(), {
        then: [fx.setWorld('c', '+', x.num(1)), fx.damage(who.trigger)],
      }),
      rule('Start', on.turnEnd(), {
        then: [fx.damage(who.trigger)],
        limit: { count: 1, per: 'game' },
      }),
    );
    s = { ...s, figures: { ...s.figures, f2: { ...s.figures.f2!, hp: 20, maxHp: 20 } } };
    s = withRules(s);
    const r = applyAction(s, pass('f1'));
    if (!r.ok) throw new Error();
    expect(r.events.some((e) => e.type === 'chainStopped' && e.reason === 'depth')).toBe(true);
    expect(r.state.world.c).toBe(2);
  });

  it('the effect budget stops runaway rules (max 50 per turn)', () => {
    const many = Array.from({ length: 30 }, (_, i) =>
      rule(`R${i}`, on.turnEnd(), {
        then: [fx.setWorld('b', '+', x.num(1)), fx.setWorld('b', '+', x.num(1))],
      }),
    );
    const s = withRules(makeGame(1), ...many);
    const r = applyAction(s, pass('f1'));
    if (!r.ok) throw new Error();
    expect(r.state.world.b).toBe(50);
    expect(r.events.some((e) => e.type === 'chainStopped' && e.reason === 'budget')).toBe(true);
  });

  it('two rules together cannot exceed the rule damage per round', () => {
    let s = withRules(
      makeGame(1, (st) => (st.rules.ruleDamagePerFigurePerRound = 2)),
      rule('A', on.roundStart(), { then: [fx.damage(who.all)] }),
      rule('B', on.roundStart(), { then: [fx.damage(who.all)] }),
      rule('C', on.roundStart(), { then: [fx.damage(who.all)] }),
    );
    s = { ...s, figures: { ...s.figures, f2: { ...s.figures.f2!, hp: 10, maxHp: 10 } } };
    s = run(s, pass('f1'), pass('f2'));
    expect(s.figures.f2?.hp).toBe(8);
  });

  it('push and teleport trigger BETRITT again (chain)', () => {
    let s = withRules(
      makeGame(1),
      rule('Eis', on.enters(), {
        when: [x.cmp(x.tileType(), '=', x.str('eis'))],
        then: [fx.push(who.trigger, where.fromTile)],
      }),
    );
    s = {
      ...s,
      tiles: {
        ...s.tiles,
        '1,0': { ...s.tiles['1,0']!, type: 'eis' },
        '2,0': { ...s.tiles['2,0']!, type: 'eis' },
      },
    };
    s = run(s, step('f1', 1, 0));
    // slides over (2,0) to (3,0)
    expect(s.figures.f1?.pos).toEqual({ x: 3, y: 0 });
    expect(s.turn.phase).toBe('action');
  });

  it('the last hero and the boss dying in the same effect is a draw', () => {
    let s = withRules(
      setHp(setHp(makeGame(1), 'f1', 1), 'f2', 1),
      rule('Weltuntergang', on.turnEnd(), { then: [fx.damage(who.all)] }),
    );
    s = run(s, pass('f1'));
    expect(s.result).toEqual({ winner: 'draw', winners: [], reason: 'simultaneous' });
  });
});
