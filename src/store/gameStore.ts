// UI-side game session: holds the engine state, plays animations and holds back
// attack results until the wheel animation has finished.
import { create } from 'zustand';
import { playSfx } from '../audio/audio';
import { applyAction } from '../engine/reducer';
import { createGame, type GameSetup } from '../engine/setup';
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
  for (const e of events) {
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

export const useGame = create<GameStore>()((set, get) => ({
  game: null,
  wheel: null,
  anim: null,
  toasts: [],
  generation: 0,

  start: (setup) => {
    const { state } = createGame(setup);
    set((s) => ({
      game: state,
      wheel: null,
      anim: null,
      toasts: [],
      generation: s.generation + 1,
    }));
  },

  clear: () =>
    set((s) => ({ game: null, wheel: null, anim: null, toasts: [], generation: s.generation + 1 })),

  dispatch: (action) => {
    const game = get().game;
    if (!game) return null;
    const result = applyAction(game, action);
    if (result.ok) {
      soundsFor(result.events);
      const toasts = toastsFor(result.events);
      set((s) => ({ game: result.state, toasts: [...s.toasts, ...toasts].slice(-4) }));
    }
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
    soundsFor(events);
    const toasts = toastsFor(events);
    set((s) => ({ game: state, wheel: null, toasts: [...s.toasts, ...toasts].slice(-4) }));
  },

  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));

export const BOT_TEMPO = { fast: 0.5, normal: 1, slow: 1.6 } as const;
