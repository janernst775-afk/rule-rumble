import type { FigureStats } from './types';

export function emptyStats(): FigureStats {
  return {
    attacks: 0,
    hits: 0,
    misses: 0,
    damageDealt: 0,
    damageTaken: 0,
    tilesMoved: 0,
    tilesAdded: 0,
    tilesRemoved: 0,
  };
}
