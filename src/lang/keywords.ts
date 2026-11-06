// The only place with keywords of the rule language (CLAUDE.md rule 8): German keywords
// with equivalent English aliases. Matching is case-insensitive and accepts UE/OE/AE/SS
// for umlauts and ß (SPEC 5.8).
import type { TileType } from '../engine/types';

export type CodeLang = 'de' | 'en';

interface Word {
  de: string;
  en: string;
}

/** Upper-case keywords (structure, events, actions). */
export const KW = {
  rule: { de: 'REGEL', en: 'RULE' },
  when: { de: 'WENN', en: 'IF' },
  and: { de: 'UND', en: 'AND' },
  or: { de: 'ODER', en: 'OR' },
  not: { de: 'NICHT', en: 'NOT' },
  then: { de: 'DANN', en: 'THEN' },
  else: { de: 'SONST', en: 'ELSE' },
  duration: { de: 'DAUER', en: 'DURATION' },
  limit: { de: 'LIMIT', en: 'LIMIT' },
  per: { de: 'PRO', en: 'PER' },
  round: { de: 'RUNDE', en: 'ROUND' },
  rounds: { de: 'RUNDEN', en: 'ROUNDS' },
  turn: { de: 'ZUG', en: 'TURN' },
  game: { de: 'SPIEL', en: 'GAME' },
  every: { de: 'ALLE', en: 'EVERY' },
  for: { de: 'FÜR', en: 'FOR' },
  at: { de: 'AUF', en: 'AT' },
  awayFrom: { de: 'WEG_VON', en: 'AWAY_FROM' },
  to: { de: 'ZU', en: 'INTO' },
  nextTo: { de: 'NEBEN', en: 'NEXT_TO' },
  randomly: { de: 'ZUFÄLLIG', en: 'RANDOMLY' },
  chance: { de: 'ZUFALL', en: 'CHANCE' },
} satisfies Record<string, Word>;

export const EVENT_KW = {
  roundStart: { de: 'RUNDENSTART', en: 'ROUND_START' },
  roundEnd: { de: 'RUNDENENDE', en: 'ROUND_END' },
  turnStart: { de: 'ZUGSTART', en: 'TURN_START' },
  turnEnd: { de: 'ZUGENDE', en: 'TURN_END' },
  enters: { de: 'BETRITT', en: 'ENTERS' },
  leaves: { de: 'VERLÄSST', en: 'LEAVES' },
  attack: { de: 'ANGRIFF', en: 'ATTACK' },
  hit: { de: 'TREFFER', en: 'HIT' },
  miss: { de: 'FEHLSCHLAG', en: 'MISS' },
  damage: { de: 'SCHADEN', en: 'DAMAGE' },
  dies: { de: 'STIRBT', en: 'DIES' },
  tileAdded: { de: 'FELD_NEU', en: 'TILE_ADDED' },
  tileRemoved: { de: 'FELD_WEG', en: 'TILE_REMOVED' },
} satisfies Record<string, Word>;

export const ACTION_KW = {
  spawn: { de: 'SPAWNE', en: 'SPAWN' },
  damage: { de: 'SCHADEN', en: 'DAMAGE' },
  heal: { de: 'HEILE', en: 'HEAL' },
  moveMod: { de: 'BEWEGUNG', en: 'MOVE' },
  teleport: { de: 'TELEPORT', en: 'TELEPORT' },
  push: { de: 'SCHIEBE', en: 'PUSH' },
  skip: { de: 'AUSSETZEN', en: 'SKIP' },
  shield: { de: 'SCHILD', en: 'SHIELD' },
  setTileType: { de: 'MACHE', en: 'MAKE' },
  removeTile: { de: 'ENTFERNE', en: 'REMOVE' },
  addTileNear: { de: 'ANLEGE', en: 'ADD' },
  wheelMod: { de: 'RADCHANCE', en: 'WHEEL' },
  setVar: { de: 'SETZE', en: 'SET' },
  message: { de: 'ZEIGE', en: 'SHOW' },
} satisfies Record<string, Word>;

/** Lower-case value words: figure targets. */
export const TARGET_W = {
  trigger: { de: 'auslöser', en: 'trigger' },
  attacker: { de: 'angreifer', en: 'attacker' },
  target: { de: 'ziel', en: 'target' },
  onTile: { de: 'alle_auf_feld', en: 'all_on_tile' },
  neighbors: { de: 'nachbarn', en: 'neighbors' },
  nearest: { de: 'nächste_figur', en: 'nearest_figure' },
  random: { de: 'zufällige_figur', en: 'random_figure' },
  all: { de: 'alle', en: 'all' },
  allNpcs: { de: 'alle_npcs', en: 'all_npcs' },
} satisfies Record<string, Word>;

/** Lower-case value words: tiles. */
export const TILE_W = {
  eventTile: { de: 'feld', en: 'tile' },
  fromTile: { de: 'von_feld', en: 'from_tile' },
  newTile: { de: 'neues_feld', en: 'new_tile' },
  neighborTiles: { de: 'nachbarfelder', en: 'neighbor_tiles' },
  randomTile: { de: 'zufälliges_feld', en: 'random_tile' },
  randomEmptyTile: { de: 'zufälliges_leeres_feld', en: 'random_empty_tile' },
  tilesOfType: { de: 'alle_felder_typ', en: 'all_tiles_of_type' },
} satisfies Record<string, Word>;

/** Lower-case value words: globals and property names. */
export const VALUE_W = {
  world: { de: 'welt', en: 'world' },
  round: { de: 'runde', en: 'round' },
  tileCount: { de: 'anzahl_felder', en: 'tile_count' },
  npcCount: { de: 'anzahl_npcs', en: 'npc_count' },
  amount: { de: 'menge', en: 'amount' },
} satisfies Record<string, Word>;

export const FIGURE_PROP_W = {
  hp: { de: 'leben', en: 'hp' },
  maxHp: { de: 'max_leben', en: 'max_hp' },
  move: { de: 'bewegung', en: 'move' },
  wheelChance: { de: 'radchance', en: 'wheel_chance' },
  shield: { de: 'schild', en: 'shield' },
  /** auslöser.feld.typ */
  tile: { de: 'feld', en: 'tile' },
} satisfies Record<string, Word>;

export const TILE_PROP_W = {
  type: { de: 'typ', en: 'type' },
  figureCount: { de: 'anzahl_figuren', en: 'figure_count' },
  texture: { de: 'textur', en: 'texture' },
} satisfies Record<string, Word>;

/** Tile types: the AST stores the German id. */
export const TILE_TYPE_W: Record<TileType, Word> = {
  normal: { de: 'normal', en: 'normal' },
  lava: { de: 'lava', en: 'lava' },
  eis: { de: 'eis', en: 'ice' },
  heilquelle: { de: 'heilquelle', en: 'spring' },
  falle: { de: 'falle', en: 'trap' },
};

/** Folds case and umlauts so that ZUFÄLLIG, zufaellig and Zufällig match. */
export function fold(word: string): string {
  return word
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss');
}

/** Finds the key of `word` in a table, accepting both languages. */
export function lookup<K extends string>(table: Record<K, Word>, word: string): K | null {
  const f = fold(word);
  for (const key of Object.keys(table) as K[]) {
    const w = table[key];
    if (fold(w.de) === f || fold(w.en) === f) return key;
  }
  return null;
}

/** All spellings of a table in one language (for suggestions and autocompletion). */
export function spellings(table: Record<string, Word>, lang: CodeLang): string[] {
  return Object.values(table).map((w) => w[lang]);
}

export function word(w: Word, lang: CodeLang): string {
  return w[lang];
}
