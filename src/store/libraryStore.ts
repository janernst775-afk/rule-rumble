// Rule library (SPEC 5.5): start rules plus every rule played or imported locally.
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { DEFAULT_NPC_TYPES } from '../engine/npc';
import { DEFAULT_SETTINGS } from '../engine/settings';
import type { RuleDefinition } from '../lang/ast';
import { START_RULES } from '../lang/library/startRules';
import { validateRule } from '../lang/validator';
import { jsonStorage } from './storage';

export const EXPORT_FORMAT = 'rule-rumble/rules';

interface LibraryState {
  /** Own and imported rules (start rules are not stored). */
  rules: RuleDefinition[];
  record: (def: RuleDefinition) => void;
  remove: (id: string) => void;
  importJson: (text: string) => { added: number; rejected: number };
}

function sameRule(a: RuleDefinition, b: RuleDefinition): boolean {
  return JSON.stringify(a.ast) === JSON.stringify(b.ast);
}

/** Loose shape check before the validator runs (imported text is untrusted). */
function looksLikeRule(value: unknown): value is RuleDefinition {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  const ast = v.ast as Record<string, unknown> | undefined;
  return (
    typeof v.id === 'string' &&
    typeof v.author === 'string' &&
    !!ast &&
    typeof ast.name === 'string' &&
    !!ast.trigger &&
    Array.isArray(ast.conditions) &&
    Array.isArray(ast.effects) &&
    Array.isArray(ast.elseEffects)
  );
}

/** Valid for the default settings (the running game validates again when it is added). */
export function isValidLibraryRule(def: RuleDefinition): boolean {
  try {
    return validateRule(def.ast, DEFAULT_SETTINGS, DEFAULT_NPC_TYPES).length === 0;
  } catch {
    return false;
  }
}

export const useLibrary = create<LibraryState>()(
  persist(
    (set, get) => ({
      rules: [],
      record: (def) => {
        if (def.id.startsWith('start.')) return;
        if (get().rules.some((r) => r.id === def.id || sameRule(r, def))) return;
        set((s) => ({ rules: [...s.rules, structuredClone(def)] }));
      },
      remove: (id) => set((s) => ({ rules: s.rules.filter((r) => r.id !== id) })),
      importJson: (text) => {
        let parsed: unknown;
        try {
          parsed = JSON.parse(text);
        } catch {
          return { added: 0, rejected: 1 };
        }
        const list = Array.isArray(parsed)
          ? parsed
          : ((parsed as { rules?: unknown[] } | null)?.rules ?? [parsed]);
        let added = 0;
        let rejected = 0;
        const known = [...START_RULES, ...get().rules];
        const next = [...get().rules];
        for (const item of list) {
          if (!looksLikeRule(item) || !isValidLibraryRule(item)) {
            rejected++;
            continue;
          }
          if (known.some((r) => sameRule(r, item)) || next.some((r) => sameRule(r, item))) continue;
          const id =
            item.id.startsWith('start.') || next.some((r) => r.id === item.id)
              ? `import.${Date.now().toString(36)}.${added}`
              : item.id;
          next.push({ id, author: item.author.slice(0, 30), ast: item.ast });
          added++;
        }
        set({ rules: next });
        return { added, rejected };
      },
    }),
    { name: 'rr.library', storage: jsonStorage },
  ),
);

export function allRules(own: RuleDefinition[]): RuleDefinition[] {
  return [...START_RULES, ...own];
}

export function exportJson(rules: RuleDefinition[]): string {
  return JSON.stringify({ format: EXPORT_FORMAT, version: 1, rules }, null, 2);
}
