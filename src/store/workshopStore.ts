// Own effects and NPC types from the effect workshop (SPEC 5.7, 5.9), stored locally.
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { DEFAULT_NPC_TYPES } from '../engine/npc';
import type { NpcType } from '../engine/types';
import type { EffectDef, RuleDefinition } from '../lang/ast';
import { resolveBundle } from '../lang/bundle';
import { jsonStorage } from './storage';

interface WorkshopState {
  effects: EffectDef[];
  npcTypes: NpcType[];
  /** Saves an effect; `previousName` renames an existing one. */
  saveEffect: (def: EffectDef, previousName?: string) => void;
  removeEffect: (name: string) => void;
  saveNpcType: (npc: NpcType) => void;
  removeNpcType: (id: string) => void;
}

export const useWorkshop = create<WorkshopState>()(
  persist(
    (set) => ({
      effects: [],
      npcTypes: [],
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

/** Attaches the own effects and NPC types a rule needs (so it works in any game). */
export function withBundleFromWorkshop(
  def: RuleDefinition,
  effects: readonly EffectDef[],
  npcTypes: readonly NpcType[],
): RuleDefinition {
  const bundle = resolveBundle(def.ast, effects, npcTypes);
  if (bundle.effects.length === 0 && bundle.npcTypes.length === 0) {
    // Keep a bundle that came with an imported rule if nothing local resolves.
    return def;
  }
  return { ...def, bundle: { effects: bundle.effects, npcTypes: bundle.npcTypes } };
}
