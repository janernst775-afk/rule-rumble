import { create } from 'zustand';
import {
  createIdbTextureRepo,
  createMemoryTextureRepo,
  hasIndexedDb,
  type TextureRecord,
  type TextureRepo,
} from '../assets/store';

interface TextureState {
  textures: Record<string, TextureRecord>;
  loaded: boolean;
  error: string | null;
  load: () => Promise<void>;
  save: (texture: TextureRecord) => Promise<void>;
  remove: (id: string) => Promise<void>;
}

let repo: TextureRepo = hasIndexedDb() ? createIdbTextureRepo() : createMemoryTextureRepo();

/** Test hook: swap the persistence layer. */
export function setTextureRepo(next: TextureRepo): void {
  repo = next;
}

export const useTextures = create<TextureState>()((set, get) => ({
  textures: {},
  loaded: false,
  error: null,
  load: async () => {
    if (get().loaded) return;
    try {
      const list = await repo.list();
      set({ textures: Object.fromEntries(list.map((t) => [t.id, t])), loaded: true });
    } catch (e) {
      // Blocked storage (private mode): keep working in memory.
      repo = createMemoryTextureRepo();
      set({ loaded: true, error: e instanceof Error ? e.message : String(e) });
    }
  },
  save: async (texture) => {
    set((s) => ({ textures: { ...s.textures, [texture.id]: texture } }));
    try {
      await repo.put(texture);
    } catch (e) {
      set({ error: e instanceof Error ? e.message : String(e) });
    }
  },
  remove: async (id) => {
    set((s) => {
      const textures = { ...s.textures };
      delete textures[id];
      return { textures };
    });
    try {
      await repo.remove(id);
    } catch (e) {
      set({ error: e instanceof Error ? e.message : String(e) });
    }
  },
}));

export function libraryTextures(textures: Record<string, TextureRecord>): TextureRecord[] {
  return Object.values(textures)
    .filter((t) => t.inLibrary)
    .sort((a, b) => b.createdAt - a.createdAt);
}
