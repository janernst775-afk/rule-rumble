// Texture library persisted in IndexedDB (SPEC 4.1). The game state only holds texture ids.
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

export interface TextureRepo {
  list(): Promise<TextureRecord[]>;
  put(texture: TextureRecord): Promise<void>;
  remove(id: string): Promise<void>;
}

interface RuleRumbleDb extends DBSchema {
  textures: { key: string; value: TextureRecord };
}

const DB_NAME = 'rule-rumble';
const DB_VERSION = 1;

let dbPromise: Promise<IDBPDatabase<RuleRumbleDb>> | null = null;

function db(): Promise<IDBPDatabase<RuleRumbleDb>> {
  dbPromise ??= openDB<RuleRumbleDb>(DB_NAME, DB_VERSION, {
    upgrade(database) {
      if (!database.objectStoreNames.contains('textures')) {
        database.createObjectStore('textures', { keyPath: 'id' });
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

export function hasIndexedDb(): boolean {
  return typeof indexedDB !== 'undefined';
}
