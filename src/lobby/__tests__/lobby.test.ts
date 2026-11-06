import { describe, expect, it } from 'vitest';
import { createGame } from '../../engine/setup';
import {
  addBot,
  createLobby,
  estimateMinutes,
  heroCount,
  makeBoss,
  makeHero,
  MAX_SEATS,
  removeSeat,
  startError,
  toGameSetup,
  applyTemplate,
} from '../lobby';

const host = { name: 'Jan', avatar: { image: null, color: '#34C77B' } };

describe('lobby', () => {
  it('starts with the host as hero and a boss bot', () => {
    const l = createLobby(host, 'ABC-123');
    expect(l.seats).toHaveLength(2);
    expect(l.seats[0]).toMatchObject({ isHost: true, role: 'hero', controller: 'human' });
    expect(l.seats[1]).toMatchObject({ role: 'boss', controller: 'bot' });
    expect(startError(l)).toBeNull();
  });

  it('adds hero bots up to five seats', () => {
    let l = createLobby(host, 'X');
    for (let i = 0; i < 10; i++) l = addBot(l);
    expect(l.seats).toHaveLength(MAX_SEATS);
    expect(heroCount(l)).toBe(4);
    expect(new Set(l.seats.map((s) => s.name)).size).toBe(MAX_SEATS);
  });

  it('never removes the host', () => {
    const l = createLobby(host, 'X');
    expect(removeSeat(l, 's1').seats).toHaveLength(2);
    expect(removeSeat(l, l.seats[1]!.id).seats).toHaveLength(1);
  });

  it('boss mode: the human takes the boss seat, the old boss becomes a hero', () => {
    let l = addBot(createLobby(host, 'X'));
    l = makeBoss(l, 's1');
    expect(l.seats.find((s) => s.isHost)?.role).toBe('boss');
    expect(l.seats.filter((s) => s.role === 'boss')).toHaveLength(1);
    expect(heroCount(l)).toBe(2);
    expect(startError(l)).toBeNull();
  });

  it('requires exactly one boss and at least one hero', () => {
    let l = createLobby(host, 'X');
    l = removeSeat(l, l.seats[1]!.id);
    expect(startError(l)).toBe('needExactlyOneBoss');
    l = makeBoss(addBot(l, 'hero'), 's1');
    l = removeSeat(l, l.seats.find((s) => !s.isHost)!.id);
    expect(startError(l)).toBe('noHero');
    expect(makeHero(l, 's1').seats[0]?.role).toBe('hero');
  });

  it('produces a valid game setup and a duration estimate', () => {
    const l = applyTemplate(addBot(addBot(createLobby(host, 'X'))), 'quick');
    const { state } = createGame(toGameSetup(l, 1));
    expect(Object.keys(state.tiles)).toHaveLength(16);
    expect(estimateMinutes(l)).toBeGreaterThan(0);
  });
});
