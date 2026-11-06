import { describe, expect, it } from 'vitest';
import { tileKey } from '../board';
import { actionAvailability, currentFigureId } from '../query';
import { applyAction } from '../reducer';
import {
  addTileError,
  removableTiles,
  removeTileError,
  tileCount,
  validAddPositions,
} from '../tiles';
import type { Action, ApplyResult, GameState, Pos } from '../types';
import { makeGame, place } from './helpers';

function ok(result: ApplyResult): GameState {
  if (!result.ok) throw new Error(`expected ok, got ${result.error.code}`);
  return result.state;
}
function code(result: ApplyResult): string | null {
  return result.ok ? null : result.error.code;
}
const stay = (actor: string): Action => ({ type: 'move', actor, path: [] });
const add = (actor: string, pos: Pos, textureId: string | null = null): Action => ({
  type: 'addTile',
  actor,
  pos,
  textureId,
});
const remove = (actor: string, pos: Pos): Action => ({ type: 'removeTile', actor, pos });

/** Game where f1 is in its action phase. */
function actionPhase(patch?: Parameters<typeof makeGame>[1]): GameState {
  return ok(applyAction(makeGame(1, patch), stay('f1')));
}

describe('add tile', () => {
  it('adds a tile next to the board with its texture id and ends the turn', () => {
    const r = applyAction(actionPhase(), add('f1', { x: 6, y: 0 }, 'tex-1'));
    const s = ok(r);
    expect(s.tiles['6,0']).toMatchObject({ textureId: 'tex-1', type: 'normal', visitedBy: [] });
    expect(tileCount(s)).toBe(37);
    expect(currentFigureId(s)).toBe('f2');
    expect(s.stats.f1?.tilesAdded).toBe(1);
    if (r.ok) expect(r.events[0]).toMatchObject({ type: 'tileAdded', pos: { x: 6, y: 0 } });
  });

  it('may grow beyond the start frame, also to negative coordinates', () => {
    const s = ok(applyAction(actionPhase(), add('f1', { x: -1, y: 3 })));
    expect(s.tiles['-1,3']).toBeDefined();
  });

  it('rejects existing, detached and diagonal-only positions', () => {
    const s = actionPhase();
    expect(code(applyAction(s, add('f1', { x: 2, y: 2 })))).toBe('tileExists');
    expect(code(applyAction(s, add('f1', { x: 8, y: 8 })))).toBe('notAdjacent');
    expect(code(applyAction(s, add('f1', { x: 6, y: 6 })))).toBe('notAdjacent');
  });

  it('respects the maximum from settings', () => {
    const s = actionPhase((st) => (st.board.maxTiles = 36));
    expect(code(applyAction(s, add('f1', { x: 6, y: 0 })))).toBe('maxTiles');
    expect(validAddPositions(s)).toEqual([]);
    expect(actionAvailability(s, 'addTile')).toEqual({
      available: false,
      reason: 'reason.maxTiles',
    });
  });

  it('is only possible in the action phase', () => {
    expect(code(applyAction(makeGame(1), add('f1', { x: 6, y: 0 })))).toBe('wrongPhase');
  });
});

describe('remove tile', () => {
  it('removes an empty tile and ends the turn', () => {
    const r = applyAction(actionPhase(), remove('f1', { x: 3, y: 3 }));
    const s = ok(r);
    expect(s.tiles['3,3']).toBeUndefined();
    expect(tileCount(s)).toBe(35);
    expect(s.stats.f1?.tilesRemoved).toBe(1);
    if (r.ok) expect(r.events.some((e) => e.type === 'tileRemoved')).toBe(true);
  });

  it('rejects tiles with figures on them', () => {
    const s = actionPhase();
    expect(code(applyAction(s, remove('f1', { x: 0, y: 0 })))).toBe('tileOccupied');
    expect(code(applyAction(s, remove('f1', { x: 5, y: 5 })))).toBe('tileOccupied');
  });

  it('allows removing a tile where only a dead figure lies', () => {
    let s = actionPhase();
    s = place(s, 'f2', 3, 3);
    s = { ...s, figures: { ...s.figures, f2: { ...s.figures.f2!, alive: false } } };
    expect(removeTileError(s, { x: 3, y: 3 })).toBeNull();
  });

  it('keeps the board connected', () => {
    let s = actionPhase();
    // Cut column x=3 except for row 0, then removing (3,0) would split the board.
    const tiles = { ...s.tiles };
    for (let y = 1; y < 6; y++) delete tiles[tileKey({ x: 3, y })];
    s = { ...s, tiles };
    expect(code(applyAction(s, remove('f1', { x: 3, y: 0 })))).toBe('wouldDisconnect');
    expect(removableTiles(s).some((p) => p.x === 3 && p.y === 0)).toBe(false);
  });

  it('respects the minimum from settings', () => {
    const s = actionPhase((st) => (st.board.minTiles = 36));
    expect(code(applyAction(s, remove('f1', { x: 3, y: 3 })))).toBe('minTiles');
    expect(actionAvailability(s, 'removeTile')).toEqual({
      available: false,
      reason: 'reason.minTiles',
    });
  });

  it('rejects missing tiles', () => {
    expect(code(applyAction(actionPhase(), remove('f1', { x: 9, y: 9 })))).toBe('noTile');
  });
});

describe('tile actions count double (Baumeister)', () => {
  it('allows a second tile action, then ends the turn', () => {
    let s = actionPhase((st) => (st.board.tileActionsPerAction = 2));
    s = ok(applyAction(s, add('f1', { x: 6, y: 0 })));
    expect(currentFigureId(s)).toBe('f1');
    expect(s.turn.phase).toBe('action');
    expect(actionAvailability(s, 'attack')).toMatchObject({ available: false });
    s = ok(applyAction(s, remove('f1', { x: 3, y: 3 })));
    expect(currentFigureId(s)).toBe('f2');
    expect(s.turn.tileActionsUsed).toBe(0);
  });

  it('allows passing after the first tile action', () => {
    let s = actionPhase((st) => (st.board.tileActionsPerAction = 2));
    s = ok(applyAction(s, add('f1', { x: 6, y: 0 })));
    s = ok(applyAction(s, { type: 'pass', actor: 'f1' }));
    expect(currentFigureId(s)).toBe('f2');
  });

  it('forbids attacking after a tile action', () => {
    let s = place(
      actionPhase((st) => (st.board.tileActionsPerAction = 2)),
      'f2',
      0,
      0,
    );
    s = ok(applyAction(s, add('f1', { x: 6, y: 0 })));
    expect(code(applyAction(s, { type: 'attack', actor: 'f1', target: 'f2' }))).toBe(
      'tileActionsUsed',
    );
  });
});

describe('addTileError helper', () => {
  it('matches the reducer', () => {
    const s = actionPhase();
    expect(addTileError(s, { x: 6, y: 2 })).toBeNull();
    expect(addTileError(s, { x: 0, y: 0 })).toBe('tileExists');
  });
});
