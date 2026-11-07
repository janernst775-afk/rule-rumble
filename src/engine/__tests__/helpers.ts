import { DEFAULT_SETTINGS, cloneSettings } from '../settings';
import { createGame, type SeatSetup } from '../setup';
import type { GameState, Settings } from '../types';

export function seat(
  role: 'hero' | 'boss',
  name: string,
  controller: 'human' | 'bot' = 'bot',
): SeatSetup {
  return {
    role,
    name,
    avatar: { image: null, color: '#34C77B' },
    controller,
    difficulty: 'normal',
  };
}

export function makeGame(heroCount = 2, patch?: (s: Settings) => void, seed = 42): GameState {
  const settings = cloneSettings(DEFAULT_SETTINGS);
  // Mechanics tests use fixed boss lives, independent of the tuned defaults (v0.8).
  settings.figures.bossHp = { mode: 'perHero', perHero: 3, solo: 4 };
  patch?.(settings);
  const seats = [
    ...Array.from({ length: heroCount }, (_, i) => seat('hero', `H${i + 1}`)),
    seat('boss', 'Boss'),
  ];
  return createGame({ seats, settings, seed }).state;
}

/** Places a figure directly (test setup only). */
export function place(state: GameState, id: string, x: number, y: number): GameState {
  const fig = state.figures[id];
  if (!fig) throw new Error(`no figure ${id}`);
  return { ...state, figures: { ...state.figures, [id]: { ...fig, pos: { x, y } } } };
}

export function setHp(state: GameState, id: string, hp: number): GameState {
  const fig = state.figures[id];
  if (!fig) throw new Error(`no figure ${id}`);
  return { ...state, figures: { ...state.figures, [id]: { ...fig, hp } } };
}
