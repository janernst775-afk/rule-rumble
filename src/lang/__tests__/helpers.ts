import { createBus, type Bus } from '../../engine/bus';
import type { ActiveRule, GameState } from '../../engine/types';
import type { RuleAST } from '../ast';

let counter = 0;

/** Puts rules directly into the state as active rules (test setup only). */
export function withRules(state: GameState, ...asts: RuleAST[]): GameState {
  const rules: ActiveRule[] = asts.map((ast, i) => ({
    id: `t${++counter}`,
    def: { id: `test.${i}`, author: 'Test', ast },
    authorId: 'f1',
    order: counter,
    addedRound: 0,
    activeFromRound: 0,
    expiresAfterRound: null,
    firedThisRound: 0,
    firedThisTurn: 0,
    firedTotal: 0,
  }));
  return { ...state, rules: [...state.rules, ...rules] };
}

/** A bus over a deep copy, for calling primitives directly. */
export function busOf(state: GameState): Bus {
  return createBus(structuredClone(state));
}

export function eventTypes(bus: { events: { type: string }[] }): string[] {
  return bus.events.map((e) => e.type);
}
