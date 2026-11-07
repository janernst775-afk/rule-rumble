// Texture and sound libraries persisted in IndexedDB (SPEC 4.1, 8.2). The game state only
// holds texture ids and sound names.
import { openDB, type DBSchema, type IDBPDatabase } from 'idb';

export interface TextureRecord {
  id: string;
  name: string;
  /** 128×128 PNG as data URL */
  dataUrl: string;
  author: string;
  createdAt: number;
  /** Shown under "Meine Texturen"; textures used only in a game keep this false. */
  inLibrary: boolean;
}

/** A recorded sound (SPEC 8.2): rules play it with SPIELE "name". */
export interface SoundRecord {
  id: string;
  /** Unique, lower case: letters, digits, _ */
  name: string;
  /** Mono WAV as data URL (already trimmed and volume-adjusted). */
  dataUrl: string;
  durationMs: number;
  /** Name of the player who recorded it ("Eigene Sounds anderer Spieler stumm"). */
  author: string;
  createdAt: number;
}

export interface SoundRepo {
  list(): Promise<SoundRecord[]>;
  put(sound: SoundRecord): Promise<void>;
  remove(id: string): Promise<void>;
}

export interface TextureRepo {
  list(): Promise<TextureRecord[]>;
  put(texture: TextureRecord): Promise<void>;
  remove(id: string): Promise<void>;
}

interface RuleRumbleDb extends DBSchema {
  textures: { key: string; value: TextureRecord };
  sounds: { key: string; value: SoundRecord };
}

const DB_NAME = 'rule-rumble';
const DB_VERSION = 2;

let dbPromise: Promise<IDBPDatabase<RuleRumbleDb>> | null = null;

function db(): Promise<IDBPDatabase<RuleRumbleDb>> {
  dbPromise ??= openDB<RuleRumbleDb>(DB_NAME, DB_VERSION, {
    upgrade(database) {
      if (!database.objectStoreNames.contains('textures')) {
        database.createObjectStore('textures', { keyPath: 'id' });
      }
      if (!database.objectStoreNames.contains('sounds')) {
        database.createObjectStore('sounds', { keyPath: 'id' });
      }
    },
  });
  return dbPromise;
}

export function createIdbTextureRepo(): TextureRepo {
  return {
    list: async () => (await db()).getAll('textures'),
    put: async (texture) => {
      await (await db()).put('textures', texture);
    },
    remove: async (id) => {
      await (await db()).delete('textures', id);
    },
  };
}

/** In-memory repo for tests and for browsers without IndexedDB. */
export function createMemoryTextureRepo(initial: TextureRecord[] = []): TextureRepo {
  const map = new Map(initial.map((t) => [t.id, t]));
  return {
    list: async () => [...map.values()],
    put: async (texture) => {
      map.set(texture.id, texture);
    },
    remove: async (id) => {
      map.delete(id);
    },
  };
}

export function createIdbSoundRepo(): SoundRepo {
  return {
    list: async () => (await db()).getAll('sounds'),
    put: async (sound) => {
      await (await db()).put('sounds', sound);
    },
    remove: async (id) => {
      await (await db()).delete('sounds', id);
    },
  };
}

export function createMemorySoundRepo(initial: SoundRecord[] = []): SoundRepo {
  const map = new Map(initial.map((x) => [x.id, x]));
  return {
    list: async () => [...map.values()],
    put: async (sound) => {
      map.set(sound.id, sound);
    },
    remove: async (id) => {
      map.delete(id);
    },
  };
}

export function hasIndexedDb(): boolean {
  return typeof indexedDB !== 'undefined';
}
