// Own effects, functions and NPC types from the effect workshop (SPEC 5.7–5.9), stored locally.
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { DEFAULT_NPC_TYPES } from '../engine/npc';
import type { NpcType } from '../engine/types';
import type { EffectDef, FunctionDef, RuleDefinition } from '../lang/ast';
import { resolveBundle } from '../lang/bundle';
import { jsonStorage } from './storage';

interface WorkshopState {
  effects: EffectDef[];
  npcTypes: NpcType[];
  /** Own functions (Profi-Code, SPEC 5.8). */
  functions: FunctionDef[];
  /** Saves an effect; `previousName` renames an existing one. */
  saveEffect: (def: EffectDef, previousName?: string) => void;
  removeEffect: (name: string) => void;
  saveNpcType: (npc: NpcType) => void;
  removeNpcType: (id: string) => void;
  /** Saves a function; `previousName` renames an existing one. */
  saveFunction: (def: FunctionDef, previousName?: string) => void;
  removeFunction: (name: string) => void;
}

export const useWorkshop = create<WorkshopState>()(
  persist(
    (set) => ({
      effects: [],
      npcTypes: [],
      functions: [],
      saveEffect: (def, previousName) =>
        set((s) => {
          const key = (previousName ?? def.name).toLowerCase();
          const others = s.effects.filter(
            (e) => e.name.toLowerCase() !== key && e.name.toLowerCase() !== def.name.toLowerCase(),
          );
          return { effects: [...others, structuredClone(def)] };
        }),
      removeEffect: (name) =>
        set((s) => ({
          effects: s.effects.filter((e) => e.name.toLowerCase() !== name.toLowerCase()),
        })),
      saveNpcType: (npc) =>
        set((s) => ({
          npcTypes: [...s.npcTypes.filter((n) => n.id !== npc.id), structuredClone(npc)],
        })),
      removeNpcType: (id) => set((s) => ({ npcTypes: s.npcTypes.filter((n) => n.id !== id) })),
      saveFunction: (def, previousName) =>
        set((s) => {
          const key = (previousName ?? def.name).toLowerCase();
          const others = (s.functions ?? []).filter(
            (f) => f.name.toLowerCase() !== key && f.name.toLowerCase() !== def.name.toLowerCase(),
          );
          return { functions: [...others, structuredClone(def)] };
        }),
      removeFunction: (name) =>
        set((s) => ({
          functions: (s.functions ?? []).filter((f) => f.name.toLowerCase() !== name.toLowerCase()),
        })),
    }),
    { name: 'rr.workshop', storage: jsonStorage },
  ),
);

/** All NPC types a player can use: built-in plus own. */
export function allNpcTypes(own: readonly NpcType[]): NpcType[] {
  return [
    ...DEFAULT_NPC_TYPES,
    ...own.filter((n) => !DEFAULT_NPC_TYPES.some((d) => d.id === n.id)),
  ];
}

/** Attaches the own effects, functions and NPC types a rule needs (so it works in any game). */
export function withBundleFromWorkshop(
  def: RuleDefinition,
  effects: readonly EffectDef[],
  npcTypes: readonly NpcType[],
  functions: readonly FunctionDef[] = [],
): RuleDefinition {
  const bundle = resolveBundle(def.ast, effects, npcTypes, functions);
  const fns = bundle.functions ?? [];
  if (bundle.effects.length === 0 && bundle.npcTypes.length === 0 && fns.length === 0) {
    // Keep a bundle that came with an imported rule if nothing local resolves.
    return def;
  }
  const out: RuleDefinition['bundle'] = { effects: bundle.effects, npcTypes: bundle.npcTypes };
  if (fns.length > 0) out.functions = fns;
  return { ...def, bundle: out };
}
