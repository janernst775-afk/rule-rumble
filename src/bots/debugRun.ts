// Debugger for the code view (SPEC 5.8 "Schritt-für-Schritt-Ausführung mit
// Variablen-Ansicht"): runs an effect or an NPC behavior once on a demo game and records
// every statement with its variables and the used budget. The UI then steps through the
// recording. Pure and deterministic for a given seed.
import { createBus } from '../engine/bus';
import { EFFECT_LIMITS } from '../engine/limits';
import * as P from '../engine/primitives';
import type { GameEvent, GameState, NpcType } from '../engine/types';
import type { EffectDef, Expr, FunctionDef, Stmt } from '../lang/ast';
import {
  EffectAbort,
  Return,
  callEffect,
  evaluate,
  newEnv,
  runStmts,
  type AbortReason,
  type Env,
  type TraceStep,
  type Value,
} from '../lang/interpreter';
import { demoGame } from './testRun';

export interface DebugRun {
  steps: TraceStep[];
  /** Why the code stopped early, or null if it ran to the end. */
  aborted: AbortReason | null;
  /** Budget used in total. */
  used: number;
  budget: number;
  events: GameEvent[];
  /** Final state, for showing names of figures in the variables view. */
  state: GameState;
}

interface Library {
  effects: readonly EffectDef[];
  functions: readonly FunctionDef[];
  npcTypes: readonly NpcType[];
}

function prepare(lib: Library, seed: number): GameState {
  const state = demoGame(seed);
  const names = new Set(lib.effects.map((e) => e.name.toLowerCase()));
  state.effects = [
    ...state.effects.filter((e) => !names.has(e.name.toLowerCase())),
    ...lib.effects,
  ].map((e) => structuredClone(e));
  state.functions = lib.functions.map((f) => structuredClone(f));
  const ids = new Set(lib.npcTypes.map((n) => n.id));
  state.npcTypes = [...state.npcTypes.filter((n) => !ids.has(n.id)), ...lib.npcTypes].map((n) =>
    structuredClone(n),
  );
  return state;
}

function finish(env: Env, run: () => void): DebugRun {
  let aborted: AbortReason | null = null;
  try {
    run();
  } catch (e) {
    if (e instanceof EffectAbort) aborted = e.reason;
    else if (!(e instanceof Return)) throw e;
  }
  return {
    steps: env.trace ?? [],
    aborted,
    used: env.budget.steps,
    budget: EFFECT_LIMITS.maxSteps,
    events: env.bus.events,
    state: env.bus.state,
  };
}

/** Runs an own effect once, as if a rule called it at the start of the first hero's turn. */
export function debugEffect(def: EffectDef, args: Expr[], lib: Library, seed = 1): DebugRun {
  const state = prepare({ ...lib, effects: [...lib.effects, def] }, seed);
  const hero = state.seatOrder[0] ?? 'f1';
  const bus = createBus(state);
  const env = newEnv(
    bus,
    { id: 'debug', name: def.name },
    { trigger: hero, tile: state.figures[hero]?.pos },
  );
  env.trace = [];
  return finish(env, () => {
    const values: Value[] = args.map((a) => evaluate(env, a));
    callEffect(env, def.name, values);
  });
}

/** Runs the own behavior of an NPC type once (the NPC appears on a free tile first). */
export function debugNpc(type: NpcType, body: Stmt[], lib: Library, seed = 1): DebugRun {
  const npcType: NpcType = { ...type, code: body };
  const others = lib.npcTypes.filter((n) => n.id !== npcType.id);
  const state = prepare({ ...lib, npcTypes: [...others, npcType] }, seed);
  const bus = createBus(state);
  const occupied = Object.values(state.figures).map((f) => `${f.pos.x},${f.pos.y}`);
  const free = Object.values(state.tiles).find((t) => !occupied.includes(`${t.pos.x},${t.pos.y}`));
  if (free) P.spawnNpc(bus, npcType, free.pos, 'debug');
  const npc = Object.values(state.figures).find((f) => f.npcTypeId === npcType.id);
  const env = newEnv(bus, { id: 'debug', name: type.name }, npc ? { self: npc.id } : {});
  env.trace = [];
  return finish(env, () => runStmts(env, body));
}
