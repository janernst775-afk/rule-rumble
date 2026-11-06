import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Settings } from '../engine/types';
import { jsonStorage } from './storage';

export interface SavedTemplate {
  id: string;
  name: string;
  settings: Settings;
}

interface TemplatesState {
  templates: SavedTemplate[];
  save: (name: string, settings: Settings) => void;
  remove: (id: string) => void;
}

export const useTemplates = create<TemplatesState>()(
  persist(
    (set) => ({
      templates: [],
      save: (name, settings) =>
        set((s) => ({
          templates: [
            ...s.templates.filter((t) => t.name !== name),
            {
              id: `t${Date.now().toString(36)}`,
              name: name.slice(0, 30),
              settings: structuredClone(settings),
            },
          ],
        })),
      remove: (id) => set((s) => ({ templates: s.templates.filter((t) => t.id !== id) })),
    }),
    { name: 'rr.templates', storage: jsonStorage },
  ),
);
