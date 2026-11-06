// Board-changing rules for the "add tile" / "remove tile" actions (SPEC 3, 4).
// All limits come from Settings; connectivity is checked with flood fill.
import { addablePositions, hasTile, isConnected, neighborTiles, parseKey, samePos } from './board';
import type { ActionErrorCode, GameState, Pos } from './types';

export type AddTileError = Extract<ActionErrorCode, 'tileExists' | 'notAdjacent' | 'maxTiles'>;
export type RemoveTileError = Extract<
  ActionErrorCode,
  'noTile' | 'tileOccupied' | 'minTiles' | 'wouldDisconnect'
>;

export function tileCount(state: GameState): number {
  return Object.keys(state.tiles).length;
}

export function addTileError(state: GameState, pos: Pos): AddTileError | null {
  if (hasTile(state.tiles, pos)) return 'tileExists';
  if (neighborTiles(state.tiles, pos).length === 0) return 'notAdjacent';
  if (tileCount(state) >= state.settings.board.maxTiles) return 'maxTiles';
  return null;
}

export function removeTileError(state: GameState, pos: Pos): RemoveTileError | null {
  if (!hasTile(state.tiles, pos)) return 'noTile';
  const occupied = Object.values(state.figures).some((f) => f.alive && samePos(f.pos, pos));
  if (occupied) return 'tileOccupied';
  if (tileCount(state) <= state.settings.board.minTiles) return 'minTiles';
  if (!isConnected(state.tiles, pos)) return 'wouldDisconnect';
  return null;
}

/** Positions where a tile may be added right now (empty if the maximum is reached). */
export function validAddPositions(state: GameState): Pos[] {
  if (tileCount(state) >= state.settings.board.maxTiles) return [];
  return addablePositions(state.tiles);
}

/** Tiles that may be removed right now. */
export function removableTiles(state: GameState): Pos[] {
  return Object.keys(state.tiles)
    .map(parseKey)
    .filter((pos) => removeTileError(state, pos) === null);
}
