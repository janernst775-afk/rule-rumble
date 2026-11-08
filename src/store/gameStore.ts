// UI-side game session: holds the engine state, plays animations and holds back
// attack results until the wheel animation has finished.
import { create } from 'zustand';
import { playRecorded, playSfx } from '../audio/audio';
import { sfxFor } from '../audio/eventSounds';
import type { SfxId } from '../audio/sfx';
import { usePrefs } from './prefsStore';
import { useProfile } from './profileStore';
import { findSound, useSounds } from './soundStore';
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

/** Short board animations for the last engine step (v0.8). */
export interface BoardFx {
  /** Changes with every step, so that animations restart. */
  id: number;
  hit: FigureId[];
  healed: FigureId[];
  spawned: FigureId[];
  /** Tile keys "x,y" */
  tilesAdded: string[];
  tilesChanged: string[];
}

function fxFor(events: GameEvent[], id: number): BoardFx {
  const fx: BoardFx = { id, hit: [], healed: [], spawned: [], tilesAdded: [], tilesChanged: [] };
  for (const e of events) {
    if (e.type === 'damaged') fx.hit.push(e.figure);
    if (e.type === 'healed' || e.type === 'statusAdded') fx.healed.push(e.figure);
    if (e.type === 'spawned') fx.spawned.push(e.figure);
    if (e.type === 'tileAdded') fx.tilesAdded.push(`${e.pos.x},${e.pos.y}`);
    if (e.type === 'tileTypeChanged' || e.type === 'textureChanged') {
      fx.tilesChanged.push(`${e.pos.x},${e.pos.y}`);
    }
  }
  return fx;
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
  fx: BoardFx | null;
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

/** At most this many different sounds per engine step, slightly staggered. */
const MAX_SOUNDS = 4;

/**
 * Plays a recorded sound by name (SPIELE "name", NPC sounds). Recordings of other players
 * stay silent when "Eigene Sounds anderer Spieler stumm" is on. Returns false if nothing played.
 */
function playNamed(name: string): boolean {
  const sound = findSound(useSounds.getState().sounds, name);
  if (!sound) return false;
  const me = useProfile.getState().name.trim();
  if (usePrefs.getState().muteOthersSounds && sound.author !== me) return false;
  playRecorded(`${sound.id}:${sound.createdAt}`, sound.dataUrl);
  return true;
}

/** Every game event has a sound (SPEC 8.2); recorded sounds replace the synthetic ones. */
function soundsFor(state: GameState, events: GameEvent[]): void {
  const synth: SfxId[] = [];
  const recorded = new Set<string>();
  for (const e of events) {
    if (e.type === 'soundPlayed') {
      if (!recorded.has(e.sound) && playNamed(e.sound)) recorded.add(e.sound);
      // SPIELE was asked for explicitly: its default sound goes first.
      else if (!synth.includes('ruleSound')) synth.unshift('ruleSound');
      continue;
    }
    // NPC sound: when it appears and when its turn starts.
    if (e.type === 'spawned' || e.type === 'turnStarted') {
      const npc = state.figures[e.figure];
      const type = npc?.kind === 'npc' ? state.npcTypes.find((n) => n.id === npc.npcTypeId) : null;
      if (type?.sound && !recorded.has(type.sound) && playNamed(type.sound)) {
        recorded.add(type.sound);
        continue;
      }
    }
    const id = sfxFor(e);
    if (id && !synth.includes(id)) synth.push(id);
  }
  synth.slice(0, MAX_SOUNDS).forEach((id, i) => {
    if (i === 0) playSfx(id);
    else setTimeout(() => playSfx(id), i * 90);
  });
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
    soundsFor(state, events);
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
      fx: fxFor(events, (s.fx?.id ?? 0) + 1),
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
    fx: null,

    start: (setup) => {
      const { state } = createGame(setup);
      set((s) => ({
        game: state,
        wheel: null,
        anim: null,
        toasts: [],
        ruleGlow: {},
        generation: s.generation + 1,
        fx: null,
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
        fx: null,
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
