// Own recorded sounds (SPEC 8.2), stored in IndexedDB.
import { create } from 'zustand';
import {
  createIdbSoundRepo,
  createMemorySoundRepo,
  hasIndexedDb,
  type SoundRecord,
  type SoundRepo,
} from '../assets/store';

interface SoundState {
  sounds: Record<string, SoundRecord>;
  loaded: boolean;
  error: string | null;
  load: () => Promise<void>;
  /** Saves a sound; a sound with the same name is replaced. */
  save: (sound: SoundRecord) => Promise<void>;
  remove: (id: string) => Promise<void>;
}

let repo: SoundRepo = hasIndexedDb() ? createIdbSoundRepo() : createMemorySoundRepo();

/** Test hook: swap the persistence layer. */
export function setSoundRepo(next: SoundRepo): void {
  repo = next;
}

export const useSounds = create<SoundState>()((set, get) => ({
  sounds: {},
  loaded: false,
  error: null,
  load: async () => {
    if (get().loaded) return;
    try {
      const list = await repo.list();
      set({ sounds: Object.fromEntries(list.map((s) => [s.id, s])), loaded: true });
    } catch (e) {
      repo = createMemorySoundRepo();
      set({ loaded: true, error: e instanceof Error ? e.message : String(e) });
    }
  },
  save: async (sound) => {
    const same = Object.values(get().sounds).filter(
      (s) => s.name === sound.name && s.id !== sound.id,
    );
    set((s) => {
      const sounds = { ...s.sounds, [sound.id]: sound };
      for (const old of same) delete sounds[old.id];
      return { sounds };
    });
    try {
      for (const old of same) await repo.remove(old.id);
      await repo.put(sound);
    } catch (e) {
      set({ error: e instanceof Error ? e.message : String(e) });
    }
  },
  remove: async (id) => {
    set((s) => {
      const sounds = { ...s.sounds };
      delete sounds[id];
      return { sounds };
    });
    try {
      await repo.remove(id);
    } catch (e) {
      set({ error: e instanceof Error ? e.message : String(e) });
    }
  },
}));

export function soundList(sounds: Record<string, SoundRecord>): SoundRecord[] {
  return Object.values(sounds).sort((a, b) => a.name.localeCompare(b.name));
}

export function findSound(
  sounds: Record<string, SoundRecord>,
  name: string,
): SoundRecord | undefined {
  const n = name.toLowerCase();
  return Object.values(sounds).find((s) => s.name === n);
}
