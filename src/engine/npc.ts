// NPC turns (SPEC 3): move like a figure (or run own code, SPEC 5.8), then attack if possible. NPCs are hostile to
// every hero and the boss, but not to other NPCs. Fully deterministic via the game RNG.
import { manhattan, reachableTiles, samePos, tileKey } from './board';
import type { Bus } from './bus';
import { resolveAttack } from './combat';
import { walkPath } from './movement';
import { effectiveMove } from './query';
import { randomPick } from './rng';
import { runNpcCode } from '../lang/runtime';
import { endTurn } from './turn';
import type { Figure, NpcType, Pos } from './types';

export const DEFAULT_NPC_TYPES: NpcType[] = [
  {
    id: 'zombie',
    name: 'Zombie',
    symbol: 'Z',
    color: '#4B6B2E',
    hp: 1,
    move: 1,
    behavior: 'chase',
  },
];

function preys(bus: Bus, npc: Figure): Figure[] {
  return Object.values(bus.state.figures).filter(
    (f) => f.alive && f.kind !== 'npc' && f.id !== npc.id,
  );
}

function walkDistances(bus: Bus, from: Pos): Map<string, number> {
  const all = reachableTiles(bus.state.tiles, from, Object.keys(bus.state.tiles).length);
  return new Map([...all].map(([k, path]) => [k, path.length]));
}

function choosePath(bus: Bus, npc: Figure, type: NpcType | undefined): Pos[] {
  const behavior = type?.behavior ?? 'chase';
  const options = reachableTiles(bus.state.tiles, npc.pos, effectiveMove(npc));
  if (behavior === 'stand' || options.size <= 1) return [];
  if (behavior === 'wander') {
    const keys = [...options.keys()].sort();
    const pick = randomPick(bus.state, keys);
    return pick ? (options.get(pick) ?? []) : [];
  }
  const targets = preys(bus, npc);
  if (targets.length === 0) return [];
  // Distance from every reachable tile to the nearest prey (walking distance).
  const preyDist = targets.map((t) => walkDistances(bus, t.pos));
  const score = (key: string) => Math.min(...preyDist.map((d) => d.get(key) ?? Infinity));
  let best: { key: string; value: number } | null = null;
  for (const key of [...options.keys()].sort()) {
    const d = score(key);
    const value = behavior === 'flee' ? -d : d;
    if (!best || value < best.value) best = { key, value };
  }
  return best ? (options.get(best.key) ?? []) : [];
}

/** Plays the whole turn of the NPC on turn: move, attack if someone is on its tile, end. */
export function npcTurn(bus: Bus, npc: Figure): void {
  const state = bus.state;
  const type = state.npcTypes.find((t) => t.id === npc.npcTypeId);
  // Own behavior from Profi-Code replaces the movement template; the attack stays.
  if (type?.code && type.code.length > 0) runNpcCode(bus, npc, type);
  else walkPath(bus, npc.id, choosePath(bus, npc, type));
  if (state.status !== 'playing') return;
  if (npc.alive) {
    const here = preys(bus, npc).filter((f) => samePos(f.pos, npc.pos));
    // Attack the prey with the fewest lives; ties by figure order.
    const target = here.sort((a, b) => a.hp - b.hp || a.id.localeCompare(b.id))[0];
    if (target) resolveAttack(bus, npc.id, target.id);
  }
  if (state.status === 'playing') endTurn(bus);
}

/** Nearest prey for display or tests. */
export function nearestPrey(bus: Bus, npc: Figure): Figure | undefined {
  return preys(bus, npc).sort((a, b) => manhattan(a.pos, npc.pos) - manhattan(b.pos, npc.pos))[0];
}

export function npcTileKey(npc: Figure): string {
  return tileKey(npc.pos);
}
