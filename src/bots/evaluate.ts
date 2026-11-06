// Board evaluation for bots (SPEC 7). Higher score = better for `perspective`.
import { reachableTiles, tileKey } from '../engine/board';
import type { Figure, FigureId, GameState, Pos } from '../engine/types';

/** Shortest walking distance over existing tiles; Infinity if unreachable. */
export function walkDistance(state: GameState, from: Pos, to: Pos): number {
  const paths = reachableTiles(state.tiles, from, Object.keys(state.tiles).length);
  const path = paths.get(tileKey(to));
  return path ? path.length : Infinity;
}

function aliveOfKind(state: GameState, kind: Figure['kind']): Figure[] {
  return Object.values(state.figures).filter((f) => f.alive && f.kind === kind);
}

/** The hero the boss should hunt: lowest hp, then nearest, then seat order. */
export function weakestHero(state: GameState, from: Pos): Figure | undefined {
  const heroes = aliveOfKind(state, 'hero');
  let best: Figure | undefined;
  let bestKey = [Infinity, Infinity];
  for (const h of heroes) {
    const key = [h.hp, walkDistance(state, from, h.pos)];
    if (key[0]! < bestKey[0]! || (key[0] === bestKey[0] && key[1]! < bestKey[1]!)) {
      best = h;
      bestKey = key;
    }
  }
  return best;
}

function finiteOr(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}

export function evaluateForBoss(state: GameState, bossId: FigureId): number {
  const me = state.figures[bossId];
  if (!me || !me.alive) return -1e6;
  const heroes = aliveOfKind(state, 'hero');
  if (heroes.length === 0) return 1e6;
  let score = me.hp * 8;
  score -= heroes.reduce((sum, h) => sum + h.hp, 0) * 12;
  score -= heroes.length * 20;
  const target = weakestHero(state, me.pos);
  if (target) score -= finiteOr(walkDistance(state, me.pos, target.pos), 20) * 3;
  return score;
}

export function evaluateForHero(state: GameState, heroId: FigureId): number {
  const me = state.figures[heroId];
  if (!me || !me.alive) return -1e6;
  const bossFig = Object.values(state.figures).find((f) => f.kind === 'boss');
  if (!bossFig || !bossFig.alive) return 1e6;
  let score = me.hp * 10 - bossFig.hp * 12;
  const allies = aliveOfKind(state, 'hero').filter((h) => h.id !== heroId);
  score += allies.reduce((sum, h) => sum + h.hp, 0) * 2;
  const distBoss = finiteOr(walkDistance(state, me.pos, bossFig.pos), 20);
  if (me.hp <= 1 && allies.length > 0) {
    // Keep distance while on the last life (SPEC 7).
    score += distBoss * 4;
  } else {
    score -= distBoss * 3;
    if (allies.length > 0) {
      const avgAlly =
        allies.reduce((sum, a) => sum + finiteOr(walkDistance(state, me.pos, a.pos), 20), 0) /
        allies.length;
      score -= avgAlly * 0.5;
    }
  }
  return score;
}

export function evaluateForNpc(state: GameState, npcId: FigureId): number {
  const me = state.figures[npcId];
  if (!me || !me.alive) return -1e6;
  const others = Object.values(state.figures).filter(
    (f) => f.alive && f.id !== npcId && f.kind !== 'npc',
  );
  const nearest = Math.min(...others.map((o) => finiteOr(walkDistance(state, me.pos, o.pos), 20)));
  return -finiteOr(nearest, 20);
}

export function evaluate(state: GameState, figureId: FigureId): number {
  const fig = state.figures[figureId];
  if (!fig) return 0;
  if (fig.kind === 'boss') return evaluateForBoss(state, figureId);
  if (fig.kind === 'hero') return evaluateForHero(state, figureId);
  return evaluateForNpc(state, figureId);
}
