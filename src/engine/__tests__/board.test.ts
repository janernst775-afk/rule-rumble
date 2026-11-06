import { describe, expect, it } from 'vitest';
import {
  addablePositions,
  createStartBoard,
  isConnected,
  isValidPath,
  neighborTiles,
  reachableTiles,
  tileKey,
  tileLabel,
} from '../board';

describe('board', () => {
  it('creates a square start board', () => {
    expect(Object.keys(createStartBoard(6))).toHaveLength(36);
    expect(Object.keys(createStartBoard(4))).toHaveLength(16);
  });

  it('finds only orthogonal, existing neighbors', () => {
    const tiles = createStartBoard(3);
    expect(neighborTiles(tiles, { x: 0, y: 0 })).toHaveLength(2);
    expect(neighborTiles(tiles, { x: 1, y: 1 })).toHaveLength(4);
  });

  it('computes reachable tiles for 0..N steps', () => {
    const tiles = createStartBoard(6);
    expect(reachableTiles(tiles, { x: 0, y: 0 }, 0).size).toBe(1);
    expect(reachableTiles(tiles, { x: 0, y: 0 }, 1).size).toBe(3);
    expect(reachableTiles(tiles, { x: 2, y: 2 }, 2).size).toBe(13);
  });

  it('does not move through missing tiles', () => {
    const tiles = createStartBoard(3);
    delete tiles[tileKey({ x: 1, y: 0 })];
    delete tiles[tileKey({ x: 1, y: 1 })];
    const reach = reachableTiles(tiles, { x: 0, y: 0 }, 2);
    expect(reach.has(tileKey({ x: 2, y: 0 }))).toBe(false);
    expect(isValidPath(tiles, { x: 0, y: 0 }, [{ x: 1, y: 0 }])).toBe(false);
    expect(isValidPath(tiles, { x: 0, y: 0 }, [{ x: 1, y: 1 }])).toBe(false);
    expect(
      isValidPath(tiles, { x: 0, y: 0 }, [
        { x: 0, y: 1 },
        { x: 0, y: 2 },
      ]),
    ).toBe(true);
  });

  it('checks connectivity with flood fill', () => {
    const tiles = createStartBoard(3);
    expect(isConnected(tiles)).toBe(true);
    delete tiles[tileKey({ x: 1, y: 0 })];
    delete tiles[tileKey({ x: 1, y: 2 })];
    expect(isConnected(tiles)).toBe(true);
    expect(isConnected(tiles, { x: 1, y: 1 })).toBe(false);
  });

  it('lists addable positions around the board', () => {
    expect(addablePositions(createStartBoard(2))).toHaveLength(8);
  });

  it('labels tiles relative to bounds', () => {
    const tiles = createStartBoard(3);
    expect(tileLabel(tiles, { x: 0, y: 0 })).toBe('A1');
    expect(tileLabel(tiles, { x: 2, y: 1 })).toBe('C2');
  });
});
