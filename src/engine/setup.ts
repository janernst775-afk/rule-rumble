import { createStartBoard, tileKey } from './board';
import { createBus } from './bus';
import { DEFAULT_NPC_TYPES } from './npc';
import { emptyStats } from './stats';
import { startRound } from './turn';
import { bossHpFor, sanitizeSettings } from './settings';
import { normalizeSeed } from './rng';
import type {
  Avatar,
  Controller,
  Difficulty,
  Figure,
  FigureStats,
  GameEvent,
  GameState,
  Participant,
  Pos,
  Settings,
} from './types';

export interface SeatSetup {
  role: 'hero' | 'boss';
  name: string;
  avatar: Avatar;
  controller: Exclude<Controller, 'npc'>;
  difficulty: Difficulty | null;
}

export interface GameSetup {
  seats: SeatSetup[];
  settings: Settings;
  seed: number;
}

export const MAX_HEROES = 4;

export type SetupError = 'noHero' | 'tooManyHeroes' | 'needExactlyOneBoss';

export function validateSetup(seats: readonly SeatSetup[]): SetupError | null {
  const heroCount = seats.filter((s) => s.role === 'hero').length;
  const bossCount = seats.filter((s) => s.role === 'boss').length;
  if (heroCount < 1) return 'noHero';
  if (heroCount > MAX_HEROES) return 'tooManyHeroes';
  if (bossCount !== 1) return 'needExactlyOneBoss';
  return null;
}

/** Hero start tiles around the top-left corner; the boss starts in the opposite corner. */
function heroStart(index: number): Pos {
  const spots: Pos[] = [
    { x: 0, y: 0 },
    { x: 1, y: 0 },
    { x: 0, y: 1 },
    { x: 1, y: 1 },
  ];
  return spots[index % spots.length] ?? { x: 0, y: 0 };
}

export function createGame(setup: GameSetup): { state: GameState; events: GameEvent[] } {
  const error = validateSetup(setup.seats);
  if (error) throw new Error(`Invalid game setup: ${error}`);
  const settings = sanitizeSettings(setup.settings);
  const size = settings.board.startSize;
  const tiles = createStartBoard(size);

  const heroSeats = setup.seats.filter((s) => s.role === 'hero');
  const bossSeat = setup.seats.find((s) => s.role === 'boss');
  if (!bossSeat) throw new Error('Invalid game setup: needExactlyOneBoss');

  const figures: Record<string, Figure> = {};
  const participants: Record<string, Participant> = {};
  const stats: Record<string, FigureStats> = {};
  const seatOrder: string[] = [];
  let nextId = 1;

  const addFigure = (
    seat: SeatSetup,
    kind: 'hero' | 'boss',
    pos: Pos,
    hp: number,
    move: number,
  ) => {
    const id = `f${nextId++}`;
    figures[id] = {
      id,
      kind,
      npcTypeId: null,
      pos,
      hp,
      maxHp: hp,
      baseMove: move,
      vars: {},
      statuses: [],
      alive: true,
      joinedRound: 0,
    };
    participants[id] = {
      figureId: id,
      name: seat.name,
      avatar: { ...seat.avatar },
      controller: seat.controller,
      difficulty: seat.difficulty,
    };
    stats[id] = emptyStats();
    seatOrder.push(id);
    const tile = tiles[tileKey(pos)];
    if (tile) tile.visitedBy.push(id);
  };

  heroSeats.forEach((seat, i) =>
    addFigure(seat, 'hero', heroStart(i), settings.figures.heroHp, settings.figures.heroMove),
  );
  addFigure(
    bossSeat,
    'boss',
    { x: size - 1, y: size - 1 },
    bossHpFor(settings, heroSeats.length),
    settings.figures.bossMove,
  );

  const state: GameState = {
    schemaVersion: 1,
    settings,
    seed: normalizeSeed(setup.seed),
    rng: normalizeSeed(setup.seed),
    round: 0,
    turn: { order: [], index: 0, phase: 'move', tileActionsUsed: 0, effectsUsed: 0 },
    status: 'playing',
    tiles,
    figures,
    seatOrder,
    participants,
    npcTypes: structuredClone(DEFAULT_NPC_TYPES),
    effects: [],
    functions: [],
    delayed: [],
    rules: [],
    pastRules: [],
    pendingVote: null,
    ruleDamage: {},
    spawnsThisRound: 0,
    textureNames: {},
    world: {},
    stats,
    log: [],
    result: null,
    nextId,
  };

  const bus = createBus(state);
  bus.events.push({ type: 'gameStarted' });
  startRound(bus);
  return { state, events: bus.events };
}
