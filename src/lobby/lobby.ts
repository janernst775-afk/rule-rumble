// Local lobby as pure JSON state, ready to be synced by a server later (CLAUDE.md rule 9).
import { bossHpFor, cloneSettings, TEMPLATES, type TemplateId } from '../engine/settings';
import { MAX_HEROES, validateSetup, type GameSetup, type SetupError } from '../engine/setup';
import type { Avatar, Difficulty, Settings } from '../engine/types';

export const MAX_SEATS = MAX_HEROES + 1;
export const HERO_COLORS = ['#34C77B', '#3DA5FF', '#FF7AC6', '#FF9F1C'] as const;
export const BOSS_COLOR = '#E5383B';

const BOT_HERO_NAMES = ['Mila', 'Kai', 'Pip', 'Juna', 'Ole', 'Nova', 'Fiete', 'Lu'];
const BOT_BOSS_NAMES = ['Grollmaul', 'Knurrbart', 'Schattenzahn'];

export type SeatRole = 'hero' | 'boss';

export interface LobbySeat {
  id: string;
  role: SeatRole;
  controller: 'human' | 'bot';
  difficulty: Difficulty | null;
  name: string;
  avatar: Avatar;
  isHost: boolean;
}

export interface Lobby {
  code: string;
  seats: LobbySeat[];
  settings: Settings;
  /** Template the custom settings are based on. */
  baseTemplate: TemplateId | 'custom';
  nextSeatId: number;
}

export interface HostProfile {
  name: string;
  avatar: Avatar;
}

export function createLobby(host: HostProfile, code: string): Lobby {
  const lobby: Lobby = {
    code,
    seats: [
      {
        id: 's1',
        role: 'hero',
        controller: 'human',
        difficulty: null,
        name: host.name,
        avatar: { ...host.avatar },
        isHost: true,
      },
    ],
    settings: cloneSettings(TEMPLATES.classic),
    baseTemplate: 'classic',
    nextSeatId: 2,
  };
  return addBot(lobby, 'boss', 'normal');
}

function usedColors(lobby: Lobby): Set<string> {
  return new Set(lobby.seats.map((s) => s.avatar.color.toUpperCase()));
}

function freeHeroColor(lobby: Lobby): string {
  const used = usedColors(lobby);
  return HERO_COLORS.find((c) => !used.has(c)) ?? HERO_COLORS[0];
}

function freeName(lobby: Lobby, pool: readonly string[]): string {
  const used = new Set(lobby.seats.map((s) => s.name));
  return pool.find((n) => !used.has(n)) ?? `Bot ${lobby.nextSeatId}`;
}

export function heroCount(lobby: Lobby): number {
  return lobby.seats.filter((s) => s.role === 'hero').length;
}

export function hasBoss(lobby: Lobby): boolean {
  return lobby.seats.some((s) => s.role === 'boss');
}

export function canAddBot(lobby: Lobby): boolean {
  return lobby.seats.length < MAX_SEATS;
}

/** Adds a bot; without an explicit role it becomes the boss if none exists, else a hero. */
export function addBot(lobby: Lobby, role?: SeatRole, difficulty: Difficulty = 'normal'): Lobby {
  if (!canAddBot(lobby)) return lobby;
  const finalRole: SeatRole = role ?? (hasBoss(lobby) ? 'hero' : 'boss');
  if (finalRole === 'boss' && hasBoss(lobby)) return lobby;
  if (finalRole === 'hero' && heroCount(lobby) >= MAX_HEROES) return lobby;
  const seat: LobbySeat = {
    id: `s${lobby.nextSeatId}`,
    role: finalRole,
    controller: 'bot',
    difficulty,
    name: finalRole === 'boss' ? freeName(lobby, BOT_BOSS_NAMES) : freeName(lobby, BOT_HERO_NAMES),
    avatar: { image: null, color: finalRole === 'boss' ? BOSS_COLOR : freeHeroColor(lobby) },
    isHost: false,
  };
  return { ...lobby, seats: [...lobby.seats, seat], nextSeatId: lobby.nextSeatId + 1 };
}

export function removeSeat(lobby: Lobby, seatId: string): Lobby {
  const seat = lobby.seats.find((s) => s.id === seatId);
  if (!seat || seat.isHost) return lobby;
  return { ...lobby, seats: lobby.seats.filter((s) => s.id !== seatId) };
}

export function updateSeat(
  lobby: Lobby,
  seatId: string,
  patch: Partial<Omit<LobbySeat, 'id' | 'isHost'>>,
): Lobby {
  return { ...lobby, seats: lobby.seats.map((s) => (s.id === seatId ? { ...s, ...patch } : s)) };
}

/**
 * Makes a seat the boss. The previous boss becomes a hero (Boss mode: the human
 * takes the boss seat). Colors follow the role defaults unless an image is set.
 */
export function makeBoss(lobby: Lobby, seatId: string): Lobby {
  const target = lobby.seats.find((s) => s.id === seatId);
  if (!target || target.role === 'boss') return lobby;
  const previous = lobby.seats.find((s) => s.role === 'boss');
  let seats = lobby.seats.map((s) => {
    if (s.id === seatId)
      return { ...s, role: 'boss' as const, avatar: { ...s.avatar, color: BOSS_COLOR } };
    if (previous && s.id === previous.id) return { ...s, role: 'hero' as const };
    return s;
  });
  if (previous) {
    const tmp: Lobby = { ...lobby, seats: seats.filter((s) => s.id !== previous.id) };
    const color = freeHeroColor(tmp);
    seats = seats.map((s) => (s.id === previous.id ? { ...s, avatar: { ...s.avatar, color } } : s));
  }
  return { ...lobby, seats };
}

export function makeHero(lobby: Lobby, seatId: string): Lobby {
  const target = lobby.seats.find((s) => s.id === seatId);
  if (!target || target.role === 'hero' || heroCount(lobby) >= MAX_HEROES) return lobby;
  const tmp: Lobby = { ...lobby, seats: lobby.seats.filter((s) => s.id !== seatId) };
  const color = freeHeroColor(tmp);
  return updateSeat(lobby, seatId, { role: 'hero', avatar: { ...target.avatar, color } });
}

export function applyTemplate(lobby: Lobby, id: TemplateId): Lobby {
  return { ...lobby, settings: cloneSettings(TEMPLATES[id]), baseTemplate: id };
}

export function setSettings(lobby: Lobby, settings: Settings): Lobby {
  return { ...lobby, settings };
}

export function startError(lobby: Lobby): SetupError | null {
  return validateSetup(lobby.seats);
}

/** Heroes keep seat order; the boss is appended by the engine. */
export function toGameSetup(lobby: Lobby, seed: number): GameSetup {
  return {
    seed,
    settings: cloneSettings(lobby.settings),
    seats: lobby.seats.map((s) => ({
      role: s.role,
      name: s.name,
      avatar: { ...s.avatar },
      controller: s.controller,
      difficulty: s.difficulty,
    })),
  };
}

const BOT_SECONDS_PER_TURN = { fast: 2, normal: 4, slow: 7 } as const;
const HUMAN_SECONDS_PER_TURN = 15;

/** Rough game length in minutes (heuristic, shown in the lobby only). */
export function estimateMinutes(lobby: Lobby): number {
  const s = lobby.settings;
  const heroes = Math.max(1, heroCount(lobby));
  const bossHp = bossHpFor(s, heroes);
  const chance = s.combat.wheelChance / 100;
  // Rounds to close the distance, then rounds to deal the boss damage.
  const approach = (s.board.startSize * 2) / Math.max(1, s.figures.bossMove + s.figures.heroMove);
  const fight = bossHp / Math.max(0.2, heroes * 0.45 * chance);
  let rounds = approach + fight;
  if (s.tempo.roundLimit) rounds = Math.min(rounds, s.tempo.roundLimit.rounds);
  const humanSec = s.tempo.turnTimeSec
    ? Math.min(HUMAN_SECONDS_PER_TURN, s.tempo.turnTimeSec)
    : HUMAN_SECONDS_PER_TURN;
  const perRound = lobby.seats.reduce(
    (sum, seat) =>
      sum + (seat.controller === 'human' ? humanSec : BOT_SECONDS_PER_TURN[s.bots.speed]),
    0,
  );
  return Math.max(3, Math.round((rounds * perRound) / 60));
}
