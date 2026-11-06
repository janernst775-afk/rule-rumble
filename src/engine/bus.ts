// Event bus for one reducer call. Every game event goes through `emit`, which records
// it and lets the active rules react (SPEC 5.6: "Jede Spielaktion sendet Ereignisse").
import { reactToEvent } from '../lang/runtime';
import type { GameEvent, GameState } from './types';

export interface Bus {
  /** The reducer draft; mutated in place. */
  state: GameState;
  events: GameEvent[];
  /** Chain depth of the events emitted right now (0 = caused by a player action). */
  depth: number;
}

export function createBus(state: GameState): Bus {
  return { state, events: [], depth: 0 };
}

export function emit(bus: Bus, event: GameEvent): void {
  bus.events.push(event);
  if (bus.state.status === 'playing') reactToEvent(bus, event);
}
