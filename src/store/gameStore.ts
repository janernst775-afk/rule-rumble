// UI-side game session: holds the engine state, plays animations and holds back
// attack results until the wheel animation has finished.
import { create } from 'zustand';
import { playSfx } from '../audio/audio';
import { applyAction } from '../engine/reducer';
import { createGame, type GameSetup } from '../engine/setup';
import type { RuleDefinition } from '../lang/ast';
import type {
  Action,
  ApplyResult,
  FigureId,
  GameEvent,
  GameState,
  Percent,
  Pos,
} from '../engine/types';

export interface WheelState {
  attacker: FigureId;
  target: FigureId;
  /** Chance shown before the spin (base chance; spread is decided by the spin). */
  previewChance: Percent;
  stage: 'ready' | 'spinning' | 'result';
  chance?: Percent;
  roll?: number;
  hit?: boolean;
  pending?: { state: GameState; events: GameEvent[] };
}

export interface Toast {
  id: number;
  key: string;
  params: Record<string, string | number>;
  tone: 'good' | 'bad' | 'info';
}

interface GameStore {
  game: GameState | null;
  wheel: WheelState | null;
  /** Display override while a figure walks along its path. */
  anim: { figure: FigureId; pos: Pos } | null;
  toasts: Toast[];
  /** Rule instance id → counter; changes when the rule fires (restarts the glow animation). */
  ruleGlow: Record<string, number>;
  /** Increments on every new game; async drivers use it to abort stale work. */
  generation: number;
  start: (setup: GameSetup) => void;
  clear: () => void;
  dispatch: (action: Action) => ApplyResult | null;
  animateMove: (figure: FigureId, path: Pos[], stepMs: number) => Promise<boolean>;
  openWheel: (attacker: FigureId, target: FigureId, previewChance: Percent) => void;
  cancelWheel: () => void;
  spinWheel: () => void;
  showWheelResult: () => void;
  commitWheel: () => void;
  dismissToast: (id: number) => void;
}

let toastId = 1;
const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function soundsFor(events: GameEvent[]): void {
  for (const e of events) {
    if (e.type === 'damaged') playSfx('damage');
    if (e.type === 'died') playSfx('death');
  }
}

function toastsFor(events: GameEvent[]): Toast[] {
  const out: Toast[] = [];
  const firedNames = new Set<string>();
  for (const e of events) {
    if (e.type === 'ruleFired' && !firedNames.has(e.name)) {
      firedNames.add(e.name);
      out.push({ id: toastId++, key: 'toast.ruleFired', params: { rule: e.name }, tone: 'info' });
    }
    if (e.type === 'message') {
      out.push({ id: toastId++, key: 'toast.message', params: { text: e.text }, tone: 'info' });
    }
    if (e.type === 'ruleAdded') {
      out.push({ id: toastId++, key: 'toast.ruleAdded', params: { rule: e.name }, tone: 'good' });
    }
    if (e.type === 'spawned') {
      out.push({ id: toastId++, key: 'toast.spawned', params: { figure: e.figure }, tone: 'bad' });
    }
    if (e.type === 'wheelResolved') {
      out.push({
        id: toastId++,
        key: e.hit ? 'toast.hit' : 'toast.miss',
        params: { attacker: e.attacker, target: e.target },
        tone: e.hit ? 'good' : 'info',
      });
    }
    if (e.type === 'died')
      out.push({ id: toastId++, key: 'toast.died', params: { figure: e.figure }, tone: 'bad' });
  }
  return out;
}

/** Listeners for rules that entered a game (the rule library records them, SPEC 5.5). */
type RuleAddedListener = (def: RuleDefinition) => void;
const ruleAddedListeners = new Set<RuleAddedListener>();
export function onRuleAdded(fn: RuleAddedListener): () => void {
  ruleAddedListeners.add(fn);
  return () => ruleAddedListeners.delete(fn);
}

export const useGame = create<GameStore>()((set, get) => {
  /** Applies a successful engine result to the UI state: sounds, toasts, rule glow. */
  const commit = (state: GameState, events: GameEvent[], extra: Partial<GameStore> = {}) => {
    soundsFor(events);
    const toasts = toastsFor(events);
    const glow = { ...get().ruleGlow };
    for (const e of events) {
      if (e.type === 'ruleFired' || e.type === 'ruleAdded') glow[e.rule] = (glow[e.rule] ?? 0) + 1;
      if (e.type === 'ruleAdded') {
        const def = state.rules.find((r) => r.id === e.rule)?.def;
        if (def) ruleAddedListeners.forEach((fn) => fn(def));
      }
    }
    set((s) => ({
      ...extra,
      game: state,
      ruleGlow: glow,
      toasts: [...s.toasts, ...toasts].slice(-4),
    }));
  };

  return {
    game: null,
    wheel: null,
    anim: null,
    toasts: [],
    ruleGlow: {},
    generation: 0,

    start: (setup) => {
      const { state } = createGame(setup);
      set((s) => ({
        game: state,
        wheel: null,
        anim: null,
        toasts: [],
        ruleGlow: {},
        generation: s.generation + 1,
      }));
    },

    clear: () =>
      set((s) => ({
        game: null,
        wheel: null,
        anim: null,
        toasts: [],
        ruleGlow: {},
        generation: s.generation + 1,
      })),

    dispatch: (action) => {
      const game = get().game;
      if (!game) return null;
      const result = applyAction(game, action);
      if (result.ok) commit(result.state, result.events);
      return result;
    },

    animateMove: async (figure, path, stepMs) => {
      const gen = get().generation;
      for (const pos of path) {
        if (get().generation !== gen) return false;
        set({ anim: { figure, pos } });
        playSfx('step');
        await wait(stepMs);
      }
      if (get().generation !== gen) return false;
      const result = get().dispatch({ type: 'move', actor: figure, path });
      set({ anim: null });
      return result?.ok ?? false;
    },

    openWheel: (attacker, target, previewChance) =>
      set({ wheel: { attacker, target, previewChance, stage: 'ready' } }),

    cancelWheel: () => {
      if (get().wheel?.stage === 'ready') set({ wheel: null });
    },

    spinWheel: () => {
      const { game, wheel } = get();
      if (!game || !wheel || wheel.stage !== 'ready') return;
      const result = applyAction(game, {
        type: 'attack',
        actor: wheel.attacker,
        target: wheel.target,
      });
      if (!result.ok) {
        set({ wheel: null });
        return;
      }
      const resolved = result.events.find((e) => e.type === 'wheelResolved');
      if (resolved?.type !== 'wheelResolved') return;
      set({
        wheel: {
          ...wheel,
          stage: 'spinning',
          chance: resolved.chance,
          roll: resolved.roll,
          hit: resolved.hit,
          pending: { state: result.state, events: result.events },
        },
      });
    },

    showWheelResult: () => {
      const wheel = get().wheel;
      if (!wheel || wheel.stage !== 'spinning') return;
      playSfx(wheel.hit ? 'hit' : 'miss');
      set({ wheel: { ...wheel, stage: 'result' } });
    },

    commitWheel: () => {
      const wheel = get().wheel;
      if (!wheel?.pending) {
        set({ wheel: null });
        return;
      }
      const { state, events } = wheel.pending;
      commit(state, events, { wheel: null });
    },

    dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
  };
});

export const BOT_TEMPO = { fast: 0.5, normal: 1, slow: 1.6 } as const;
