import { describe, expect, it } from 'vitest';
import { applyAction } from '../reducer';
import { currentFigureId } from '../query';
import { checkVictory } from '../turn';
import type { Action, ApplyResult, GameEvent, GameState } from '../types';
import { makeGame, place, setHp } from './helpers';

function ok(result: ApplyResult): GameState {
  if (!result.ok) throw new Error(`expected ok, got ${result.error.code}`);
  return result.state;
}

function errorCode(result: ApplyResult): string | null {
  return result.ok ? null : result.error.code;
}

function run(state: GameState, ...actions: Action[]): GameState {
  return actions.reduce((s, a) => ok(applyAction(s, a)), state);
}

/** Forces every spin to hit (100) or miss (0); bypasses settings sanitizing on purpose. */
function withChance(state: GameState, chance: number): GameState {
  return {
    ...state,
    settings: { ...state.settings, combat: { ...state.settings.combat, wheelChance: chance } },
  };
}

function kill(state: GameState, id: string): GameState {
  const fig = state.figures[id];
  if (!fig) throw new Error(id);
  return { ...state, figures: { ...state.figures, [id]: { ...fig, alive: false, hp: 0 } } };
}

const stay = (actor: string): Action => ({ type: 'move', actor, path: [] });
const pass = (actor: string): Action => ({ type: 'pass', actor });
const attack = (actor: string, target: string): Action => ({ type: 'attack', actor, target });

describe('setup', () => {
  it('places heroes in a corner and the boss opposite', () => {
    const s = makeGame(2);
    expect(s.figures.f1?.pos).toEqual({ x: 0, y: 0 });
    expect(s.figures.f3?.kind).toBe('boss');
    expect(s.figures.f3?.pos).toEqual({ x: 5, y: 5 });
    expect(s.figures.f3?.hp).toBe(6);
    expect(s.round).toBe(1);
    expect(s.turn.order).toEqual(['f1', 'f2', 'f3']);
  });

  it('uses the solo boss value with one hero', () => {
    expect(makeGame(1).figures.f2?.hp).toBe(4);
  });

  it('rejects invalid setups', () => {
    expect(() => makeGame(0)).toThrow();
    expect(() => makeGame(5)).toThrow();
  });
});

describe('turn order and phases', () => {
  it('runs heroes in seat order, then the boss, then a new round', () => {
    let s = makeGame(2);
    expect(currentFigureId(s)).toBe('f1');
    s = run(s, pass('f1'));
    expect(currentFigureId(s)).toBe('f2');
    s = run(s, pass('f2'));
    expect(currentFigureId(s)).toBe('f3');
    s = run(s, pass('f3'));
    expect(s.round).toBe(2);
    expect(currentFigureId(s)).toBe('f1');
    expect(s.turn.phase).toBe('move');
  });

  it('rejects actions from figures not on turn', () => {
    expect(errorCode(applyAction(makeGame(2), pass('f2')))).toBe('notYourTurn');
  });

  it('requires moving before acting', () => {
    const s = place(makeGame(1), 'f2', 0, 0);
    expect(errorCode(applyAction(s, attack('f1', 'f2')))).toBe('wrongPhase');
  });

  it('does not allow moving twice', () => {
    const s = run(makeGame(1), stay('f1'));
    expect(errorCode(applyAction(s, stay('f1')))).toBe('wrongPhase');
  });

  it('skips dead figures', () => {
    const s = run(kill(makeGame(3), 'f2'), pass('f1'));
    expect(currentFigureId(s)).toBe('f3');
  });

  it('drops dead figures from the next round order', () => {
    let s = kill(makeGame(3), 'f2');
    s = run(s, pass('f1'), pass('f3'), pass('f4'));
    expect(s.turn.order).toEqual(['f1', 'f3', 'f4']);
  });

  it('disables tile and rule actions in v0.1', () => {
    const s = run(makeGame(1), stay('f1'));
    expect(errorCode(applyAction(s, { type: 'addRule', actor: 'f1', ruleId: 'x' }))).toBe(
      'notYetAvailable',
    );
    expect(
      errorCode(
        applyAction(s, { type: 'addTile', actor: 'f1', pos: { x: 6, y: 0 }, textureId: null }),
      ),
    ).toBe('notYetAvailable');
    expect(
      errorCode(applyAction(s, { type: 'removeTile', actor: 'f1', pos: { x: 3, y: 3 } })),
    ).toBe('notYetAvailable');
  });
});

describe('movement', () => {
  it('allows standing still and moving up to the move range', () => {
    let s = makeGame(1);
    s = run(s, { type: 'move', actor: 'f1', path: [{ x: 1, y: 0 }] });
    expect(s.figures.f1?.pos).toEqual({ x: 1, y: 0 });
    expect(s.turn.phase).toBe('action');
    s = run(s, pass('f1'));
    s = run(s, {
      type: 'move',
      actor: 'f2',
      path: [
        { x: 4, y: 5 },
        { x: 3, y: 5 },
      ],
    });
    expect(s.figures.f2?.pos).toEqual({ x: 3, y: 5 });
  });

  it('rejects paths that are too long, diagonal or off the board', () => {
    const s = makeGame(1);
    const tooLong: Action = {
      type: 'move',
      actor: 'f1',
      path: [
        { x: 1, y: 0 },
        { x: 2, y: 0 },
      ],
    };
    expect(errorCode(applyAction(s, tooLong))).toBe('pathTooLong');
    expect(errorCode(applyAction(s, { type: 'move', actor: 'f1', path: [{ x: 1, y: 1 }] }))).toBe(
      'invalidPath',
    );
    expect(errorCode(applyAction(s, { type: 'move', actor: 'f1', path: [{ x: -1, y: 0 }] }))).toBe(
      'invalidPath',
    );
  });

  it('respects a move setting of 0', () => {
    const s = makeGame(1, (st) => (st.figures.heroMove = 0));
    expect(errorCode(applyAction(s, { type: 'move', actor: 'f1', path: [{ x: 1, y: 0 }] }))).toBe(
      'pathTooLong',
    );
  });

  it('emits per-step events and tracks first visits', () => {
    const r = applyAction(makeGame(1), { type: 'move', actor: 'f1', path: [{ x: 0, y: 1 }] });
    if (!r.ok) throw new Error();
    expect(r.events.map((e) => e.type)).toEqual(['tileLeft', 'tileEntered']);
    expect(r.events[1]).toMatchObject({ firstVisit: true });
    expect(r.state.tiles['0,1']?.visitedBy).toContain('f1');
  });
});

describe('attack', () => {
  it('only works on the same tile', () => {
    const s = run(makeGame(1), stay('f1'));
    expect(errorCode(applyAction(s, attack('f1', 'f2')))).toBe('noTarget');
  });

  it('cannot target itself', () => {
    const s = run(makeGame(1), stay('f1'));
    expect(errorCode(applyAction(s, attack('f1', 'f1')))).toBe('invalidTarget');
  });

  it('deals 1 damage on hit and ends the turn', () => {
    let s = withChance(place(makeGame(1), 'f2', 0, 0), 100);
    s = run(s, stay('f1'), attack('f1', 'f2'));
    expect(s.figures.f2?.hp).toBe(3);
    expect(currentFigureId(s)).toBe('f2');
    expect(s.stats.f1?.hits).toBe(1);
    expect(s.stats.f2?.damageTaken).toBe(1);
  });

  it('does nothing on a miss', () => {
    let s = withChance(place(makeGame(1), 'f2', 0, 0), 0);
    s = run(s, stay('f1'), attack('f1', 'f2'));
    expect(s.figures.f2?.hp).toBe(4);
    expect(s.stats.f1?.misses).toBe(1);
  });

  it('lets the attacker choose among several targets', () => {
    let s = withChance(makeGame(2), 100);
    s = place(place(s, 'f2', 0, 0), 'f3', 0, 0);
    s = run(s, stay('f1'), attack('f1', 'f3'));
    expect(s.figures.f3?.hp).toBe(5);
    expect(s.figures.f2?.hp).toBe(3);
  });

  it('respects the friendly-fire setting', () => {
    let s = place(
      makeGame(2, (st) => (st.combat.friendlyFire = false)),
      'f2',
      0,
      0,
    );
    s = run(s, stay('f1'));
    expect(errorCode(applyAction(s, attack('f1', 'f2')))).toBe('friendlyFireOff');
  });

  it('allows heroes to attack each other by default', () => {
    let s = withChance(place(makeGame(2), 'f2', 0, 0), 100);
    s = run(s, stay('f1'), attack('f1', 'f2'));
    expect(s.figures.f2?.hp).toBe(2);
  });

  it('a shield blocks the next hit', () => {
    let s = withChance(place(makeGame(1), 'f2', 0, 0), 100);
    s = {
      ...s,
      figures: {
        ...s.figures,
        f2: { ...s.figures.f2!, statuses: [{ kind: 'shield', remaining: 1 }] },
      },
    };
    s = run(s, stay('f1'), attack('f1', 'f2'));
    expect(s.figures.f2?.hp).toBe(4);
    expect(s.figures.f2?.statuses).toEqual([]);
  });

  it('applies the wheel spread within bounds', () => {
    let s = place(
      makeGame(1, (st) => (st.combat.wheelChanceSpread = 10)),
      'f2',
      0,
      0,
    );
    s = run(s, stay('f1'));
    const r = applyAction(s, attack('f1', 'f2'));
    if (!r.ok) throw new Error();
    const declared = r.events.find((e) => e.type === 'attackDeclared');
    if (declared?.type !== 'attackDeclared') throw new Error();
    expect(declared.chance).toBeGreaterThanOrEqual(40);
    expect(declared.chance).toBeLessThanOrEqual(60);
  });

  it('decides hits by the seeded wheel', () => {
    const s = run(place(makeGame(1), 'f2', 0, 0), stay('f1'));
    const a = applyAction(s, attack('f1', 'f2'));
    const b = applyAction(s, attack('f1', 'f2'));
    expect(a).toEqual(b);
  });
});

describe('death and victory', () => {
  it('heroes win when the boss dies; dead heroes do not win', () => {
    let s = withChance(kill(makeGame(2), 'f2'), 100);
    s = setHp(place(s, 'f3', 0, 0), 'f3', 1);
    s = run(s, stay('f1'), attack('f1', 'f3'));
    expect(s.status).toBe('over');
    expect(s.result).toEqual({ winner: 'heroes', winners: ['f1'], reason: 'bossDied' });
    expect(errorCode(applyAction(s, pass('f1')))).toBe('gameOver');
  });

  it('boss wins when all heroes are dead', () => {
    let s = withChance(makeGame(1), 100);
    s = setHp(place(s, 'f2', 0, 0), 'f1', 1);
    s = run(s, pass('f1'), stay('f2'), attack('f2', 'f1'));
    expect(s.result?.winner).toBe('boss');
    expect(s.figures.f1?.alive).toBe(false);
  });

  it('a hero killed by another hero is out, the game goes on', () => {
    let s = withChance(makeGame(2), 100);
    s = setHp(place(s, 'f2', 0, 0), 'f2', 1);
    s = run(s, stay('f1'), attack('f1', 'f2'));
    expect(s.figures.f2?.alive).toBe(false);
    expect(s.status).toBe('playing');
    expect(currentFigureId(s)).toBe('f3');
  });

  it('ends in a draw when the last hero and the boss die together', () => {
    // Not reachable through attacks in v0.1 (rules come in v0.3); checks the victory logic directly.
    const s = kill(kill(makeGame(1), 'f1'), 'f2');
    const draft: GameState = { ...s, log: [...s.log] };
    const events: GameEvent[] = [];
    expect(checkVictory(draft, events)).toBe(true);
    expect(draft.result?.winner).toBe('draw');
    expect(events.at(-1)?.type).toBe('gameOver');
  });

  it('applies the round limit with the configured outcome', () => {
    let s = makeGame(1, (st) => (st.tempo.roundLimit = { rounds: 10, outcome: 'draw' }));
    for (let r = 0; r < 10; r++) s = run(s, pass('f1'), pass('f2'));
    expect(s.result).toEqual({ winner: 'draw', winners: [], reason: 'roundLimit' });

    let b = makeGame(1, (st) => (st.tempo.roundLimit = { rounds: 10, outcome: 'boss' }));
    for (let r = 0; r < 10; r++) b = run(b, pass('f1'), pass('f2'));
    expect(b.result).toEqual({ winner: 'boss', winners: ['f2'], reason: 'roundLimit' });
  });
});

describe('purity', () => {
  it('does not mutate the input state', () => {
    const s = makeGame(1);
    const snapshot = JSON.stringify(s);
    applyAction(s, { type: 'move', actor: 'f1', path: [{ x: 1, y: 0 }] });
    expect(JSON.stringify(s)).toBe(snapshot);
  });

  it('keeps the state JSON-serializable', () => {
    const s = run(makeGame(2), stay('f1'), pass('f1'));
    expect(JSON.parse(JSON.stringify(s))).toEqual(s);
  });
});
