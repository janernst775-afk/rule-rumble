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
  /** Rule instance ids whose effects are running (innermost last). */
  causes: string[];
}

export function createBus(state: GameState): Bus {
  return { state, events: [], depth: 0, causes: [] };
}

export function emit(bus: Bus, event: GameEvent): void {
  // Events caused by a rule effect remember the rule (test run, UI highlights).
  const cause = bus.causes[bus.causes.length - 1];
  const traced = cause ? { ...event, cause } : event;
  bus.events.push(traced);
  if (bus.state.status === 'playing') reactToEvent(bus, traced);
}

/** The rule instance that caused an event, if any. */
export function causeOf(event: GameEvent): string | undefined {
  return (event as GameEvent & { cause?: string }).cause;
}
