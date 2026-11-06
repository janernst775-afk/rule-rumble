// Moving figures step by step. Every step emits tileLeft / tileEntered, so rules
// with BETRITT / VERLÄSST react to walking, pushing and teleporting alike.
import { tileKey } from './board';
import { emit, type Bus } from './bus';
import type { FigureId, Pos } from './types';

/** Moves a figure one step (or jump) to `to`. Returns false if it could not move. */
export function stepFigure(bus: Bus, figureId: FigureId, to: Pos): boolean {
  const state = bus.state;
  const fig = state.figures[figureId];
  if (!fig || !fig.alive) return false;
  const tile = state.tiles[tileKey(to)];
  if (!tile) return false;
  const from = { ...fig.pos };
  emit(bus, { type: 'tileLeft', figure: fig.id, pos: from, to: { ...to } });
  // A rule reacting to VERLÄSST may have killed or moved the figure.
  if (!fig.alive || fig.pos.x !== from.x || fig.pos.y !== from.y) return false;
  fig.pos = { ...to };
  const current = state.tiles[tileKey(to)];
  const firstVisit = current ? !current.visitedBy.includes(fig.id) : false;
  if (current && firstVisit) current.visitedBy.push(fig.id);
  emit(bus, { type: 'tileEntered', figure: fig.id, pos: { ...to }, from, firstVisit });
  return true;
}

/** Walks along a validated path; stops early if a rule interrupts the walk. */
export function walkPath(bus: Bus, figureId: FigureId, path: readonly Pos[]): number {
  let steps = 0;
  for (const step of path) {
    if (bus.state.status !== 'playing') break;
    if (!stepFigure(bus, figureId, step)) break;
    steps++;
    const fig = bus.state.figures[figureId];
    // Pushed or teleported by a rule during the walk: the rest of the path is void.
    if (!fig || fig.pos.x !== step.x || fig.pos.y !== step.y) break;
  }
  return steps;
}
