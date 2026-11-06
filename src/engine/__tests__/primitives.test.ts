import { describe, expect, it } from 'vitest';
import { tileKey } from '../board';
import { DEFAULT_NPC_TYPES } from '../npc';
import * as P from '../primitives';
import { baseWheelChance, effectiveMove } from '../query';
import type { GameState } from '../types';
import { busOf, eventTypes } from '../../lang/__tests__/helpers';
import { makeGame, place, setHp } from './helpers';

const zombie = DEFAULT_NPC_TYPES[0]!;

function game(patch?: Parameters<typeof makeGame>[1]): GameState {
  return makeGame(2, patch);
}

describe('primitives (SPEC 5.2 / 6.2)', () => {
  it('ruleDamage: 1 per effect, capped per figure and round', () => {
    const bus = busOf(game((s) => (s.rules.ruleDamagePerFigurePerRound = 2)));
    P.ruleDamage(bus, 'f1', 5);
    expect(bus.state.figures.f1?.hp).toBe(2);
    P.ruleDamage(bus, 'f1', 1);
    P.ruleDamage(bus, 'f1', 1);
    expect(bus.state.figures.f1?.hp).toBe(1);
    expect(eventTypes(bus)).toContain('damageCapped');
  });

  it('ruleDamage: attacks do not count towards the cap', () => {
    const bus = busOf(game((s) => (s.rules.ruleDamagePerFigurePerRound = 1)));
    bus.state.figures.f1!.hp = 3;
    // attack damage would not touch ruleDamage
    expect(bus.state.ruleDamage.f1).toBeUndefined();
    P.ruleDamage(bus, 'f1', 1);
    expect(bus.state.ruleDamage.f1).toBe(1);
  });

  it('ruleDamage: comeback dodges sometimes at 1 life', () => {
    let dodged = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const s = setHp(
        game((st) => (st.combat.comeback = true)),
        'f1',
        1,
      );
      const bus = busOf({ ...s, rng: seed });
      P.ruleDamage(bus, 'f1', 1);
      if (bus.state.figures.f1?.alive) dodged++;
    }
    expect(dodged).toBeGreaterThan(5);
    expect(dodged).toBeLessThan(35);
  });

  it('no instant death: a full-life figure survives any single rule effect', () => {
    const bus = busOf(game());
    P.ruleDamage(bus, 'f3', 99);
    expect(bus.state.figures.f3?.hp).toBe(bus.state.figures.f3!.maxHp - 1);
  });

  it('heal: 1 per effect, never above max life', () => {
    const bus = busOf(setHp(game(), 'f1', 1));
    P.heal(bus, 'f1', 5);
    expect(bus.state.figures.f1?.hp).toBe(2);
    P.heal(bus, 'f1', 1);
    P.heal(bus, 'f1', 1);
    expect(bus.state.figures.f1?.hp).toBe(3);
    expect(bus.state.figures.f1?.maxHp).toBe(3);
  });

  it('moveModifier: result always 0..3', () => {
    const bus = busOf(game());
    P.moveModifier(bus, 'f3', 3, 2);
    P.moveModifier(bus, 'f3', 3, 2);
    expect(effectiveMove(bus.state.figures.f3!)).toBe(3);
    P.moveModifier(bus, 'f1', -3, 1);
    expect(effectiveMove(bus.state.figures.f1!)).toBe(0);
  });

  it('wheelModifier: result always 25..75 %', () => {
    const bus = busOf(game());
    P.wheelModifier(bus, 'f1', 50, 1);
    P.wheelModifier(bus, 'f1', 50, 1);
    expect(baseWheelChance(bus.state, bus.state.figures.f1!)).toBe(75);
    P.wheelModifier(bus, 'f2', -50, 1);
    P.wheelModifier(bus, 'f2', -50, 1);
    expect(baseWheelChance(bus.state, bus.state.figures.f2!)).toBe(25);
  });

  it('shield: at most one at a time', () => {
    const bus = busOf(game());
    P.shield(bus, 'f1');
    P.shield(bus, 'f1');
    expect(bus.state.figures.f1?.statuses.filter((s) => s.kind === 'shield')).toHaveLength(1);
  });

  it('skip: one turn, never twice in a row', () => {
    const bus = busOf(game());
    P.skipTurn(bus, 'f2');
    P.skipTurn(bus, 'f2');
    expect(bus.state.figures.f2?.statuses.filter((s) => s.kind === 'skip')).toHaveLength(1);
    bus.state.figures.f2!.statuses = [{ kind: 'skipCooldown' }];
    P.skipTurn(bus, 'f2');
    expect(bus.state.figures.f2?.statuses.some((s) => s.kind === 'skip')).toBe(false);
  });

  it('teleport: moves to another existing tile and emits enter events', () => {
    const bus = busOf(game());
    P.teleportRandom(bus, 'f1');
    const pos = bus.state.figures.f1!.pos;
    expect(bus.state.tiles[tileKey(pos)]).toBeDefined();
    expect(pos).not.toEqual({ x: 0, y: 0 });
    expect(eventTypes(bus)).toEqual(['tileLeft', 'tileEntered']);
  });

  it('push: one tile away, nothing without a tile', () => {
    let bus = busOf(place(game(), 'f1', 2, 2));
    P.push(bus, 'f1', { x: 1, y: 2 });
    expect(bus.state.figures.f1?.pos).toEqual({ x: 3, y: 2 });
    bus = busOf(place(game(), 'f1', 0, 2));
    P.push(bus, 'f1', { x: 1, y: 2 });
    expect(bus.state.figures.f1?.pos).toEqual({ x: 0, y: 2 });
  });

  it('setTileType changes only existing tiles', () => {
    const bus = busOf(game());
    P.setTileType(bus, { x: 2, y: 2 }, 'lava');
    P.setTileType(bus, { x: 9, y: 9 }, 'lava');
    expect(bus.state.tiles['2,2']?.type).toBe('lava');
    expect(eventTypes(bus)).toEqual(['tileTypeChanged']);
  });

  it('removeTile by rule keeps board limits and connectivity', () => {
    let bus = busOf(game());
    P.removeTileByRule(bus, { x: 3, y: 3 });
    expect(bus.state.tiles['3,3']).toBeUndefined();
    P.removeTileByRule(bus, { x: 0, y: 0 }); // occupied
    expect(bus.state.tiles['0,0']).toBeDefined();
    bus = busOf(game((s) => (s.board.minTiles = 36)));
    P.removeTileByRule(bus, { x: 3, y: 3 });
    expect(bus.state.tiles['3,3']).toBeDefined();
  });

  it('addTileNear respects the maximum', () => {
    let bus = busOf(game());
    P.addTileNear(bus, { x: 5, y: 0 });
    expect(Object.keys(bus.state.tiles)).toHaveLength(37);
    bus = busOf(game((s) => (s.board.maxTiles = 36)));
    P.addTileNear(bus, { x: 5, y: 0 });
    expect(Object.keys(bus.state.tiles)).toHaveLength(36);
  });

  it('spawn: limited per round and on the board (Settings)', () => {
    const bus = busOf(
      game((s) => {
        s.npcs.maxSpawnsPerRound = 2;
        s.npcs.maxOnBoard = 3;
      }),
    );
    for (let i = 0; i < 5; i++) P.spawnNpc(bus, zombie, { x: 3, y: 3 }, 'r');
    const npcs = Object.values(bus.state.figures).filter((f) => f.kind === 'npc');
    expect(npcs).toHaveLength(2);
    expect(eventTypes(bus).filter((t) => t === 'spawnBlocked')).toHaveLength(3);
    bus.state.spawnsThisRound = 0;
    for (let i = 0; i < 5; i++) P.spawnNpc(bus, zombie, { x: 3, y: 3 }, 'r');
    expect(Object.values(bus.state.figures).filter((f) => f.kind === 'npc')).toHaveLength(3);
    expect(bus.state.participants[npcs[0]!.id]?.controller).toBe('npc');
  });

  it('setVariable clamps to −1000..1000', () => {
    const bus = busOf(game());
    P.setVariable(bus, 'world', 'flut', '+', 5000);
    expect(bus.state.world.flut).toBe(1000);
    P.setVariable(bus, { figure: 'f1' }, 'Seelen', '-', 5000);
    expect(bus.state.figures.f1?.vars.seelen).toBe(-1000);
  });

  it('message is cut to 80 characters', () => {
    const bus = busOf(game());
    P.showMessage(bus, 'r1', 'x'.repeat(200));
    const e = bus.events[0];
    expect(e?.type === 'message' && e.text.length).toBe(80);
  });
});
