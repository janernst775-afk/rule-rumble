import type { Pos, Tile, TileKey } from './types';

export type Tiles = Record<TileKey, Tile>;

export const DIRECTIONS: readonly Pos[] = [
  { x: 0, y: -1 },
  { x: 1, y: 0 },
  { x: 0, y: 1 },
  { x: -1, y: 0 },
];

export function tileKey(pos: Pos): TileKey {
  return `${pos.x},${pos.y}`;
}

export function parseKey(key: TileKey): Pos {
  const [x, y] = key.split(',').map(Number);
  return { x: x ?? 0, y: y ?? 0 };
}

export function samePos(a: Pos, b: Pos): boolean {
  return a.x === b.x && a.y === b.y;
}

export function isAdjacent(a: Pos, b: Pos): boolean {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y) === 1;
}

export function manhattan(a: Pos, b: Pos): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

export function orthogonalPositions(pos: Pos): Pos[] {
  return DIRECTIONS.map((d) => ({ x: pos.x + d.x, y: pos.y + d.y }));
}

export function hasTile(tiles: Tiles, pos: Pos): boolean {
  return tileKey(pos) in tiles;
}

/** Existing orthogonal neighbor positions. */
export function neighborTiles(tiles: Tiles, pos: Pos): Pos[] {
  return orthogonalPositions(pos).filter((p) => hasTile(tiles, p));
}

export function createTile(pos: Pos): Tile {
  return { pos: { ...pos }, type: 'normal', textureId: null, visitedBy: [] };
}

/** Square start board with tiles at 0..size-1 on both axes. */
export function createStartBoard(size: number): Tiles {
  const tiles: Tiles = {};
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const pos = { x, y };
      tiles[tileKey(pos)] = createTile(pos);
    }
  }
  return tiles;
}

/**
 * Breadth-first search over existing tiles. Returns, for every tile reachable
 * within `maxSteps`, one shortest path (excluding the start).
 * Iteration order is deterministic (DIRECTIONS order).
 */
export function reachableTiles(tiles: Tiles, from: Pos, maxSteps: number): Map<TileKey, Pos[]> {
  const result = new Map<TileKey, Pos[]>();
  if (!hasTile(tiles, from)) return result;
  result.set(tileKey(from), []);
  let frontier: Pos[] = [from];
  for (let step = 0; step < maxSteps; step++) {
    const next: Pos[] = [];
    for (const pos of frontier) {
      const basePath = result.get(tileKey(pos)) ?? [];
      for (const n of neighborTiles(tiles, pos)) {
        const k = tileKey(n);
        if (result.has(k)) continue;
        result.set(k, [...basePath, n]);
        next.push(n);
      }
    }
    frontier = next;
  }
  return result;
}

/** Checks that each step is orthogonal and lands on an existing tile. */
export function isValidPath(tiles: Tiles, from: Pos, path: readonly Pos[]): boolean {
  let current = from;
  for (const step of path) {
    if (!isAdjacent(current, step) || !hasTile(tiles, step)) return false;
    current = step;
  }
  return true;
}

/** Flood-fill: are all tiles (optionally without one) orthogonally connected? */
export function isConnected(tiles: Tiles, without?: Pos): boolean {
  const skip = without ? tileKey(without) : null;
  const keys = Object.keys(tiles).filter((k) => k !== skip);
  if (keys.length === 0) return true;
  const firstKey = keys[0];
  if (firstKey === undefined) return true;
  const seen = new Set<TileKey>([firstKey]);
  const stack: Pos[] = [parseKey(firstKey)];
  while (stack.length > 0) {
    const pos = stack.pop();
    if (!pos) break;
    for (const n of neighborTiles(tiles, pos)) {
      const k = tileKey(n);
      if (k === skip || seen.has(k)) continue;
      seen.add(k);
      stack.push(n);
    }
  }
  return seen.size === keys.length;
}

/** Free positions orthogonally adjacent to the board (candidates for "add tile"). */
export function addablePositions(tiles: Tiles): Pos[] {
  const out = new Map<TileKey, Pos>();
  for (const key of Object.keys(tiles)) {
    for (const p of orthogonalPositions(parseKey(key))) {
      const k = tileKey(p);
      if (!(k in tiles) && !out.has(k)) out.set(k, p);
    }
  }
  return [...out.values()].sort((a, b) => a.y - b.y || a.x - b.x);
}

export interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export function boardBounds(tiles: Tiles): Bounds {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const key of Object.keys(tiles)) {
    const { x, y } = parseKey(key);
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  if (minX === Infinity) return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  return { minX, minY, maxX, maxY };
}

function columnName(index: number): string {
  let n = index;
  let name = '';
  do {
    name = String.fromCharCode(65 + (n % 26)) + name;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return name;
}

/** Human-readable tile label ("C2") relative to the current board bounds. */
export function tileLabel(tiles: Tiles, pos: Pos): string {
  const b = boardBounds(tiles);
  return `${columnName(pos.x - b.minX)}${pos.y - b.minY + 1}`;
}
