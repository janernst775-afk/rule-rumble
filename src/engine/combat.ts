// Attack resolution shared by players, bots and NPCs (SPEC 3).
import { emit, type Bus } from './bus';
import { baseWheelChance } from './query';
import { randomFloat, randomInt } from './rng';
import { damageFigure, log } from './turn';
import type { FigureId } from './types';

/** Spins the wheel for an attack and applies the result. Does not end the turn. */
export function resolveAttack(bus: Bus, attackerId: FigureId, targetId: FigureId): void {
  const state = bus.state;
  const attacker = state.figures[attackerId];
  const target = state.figures[targetId];
  if (!attacker || !target) return;
  const spread = state.settings.combat.wheelChanceSpread;
  const base = baseWheelChance(state, attacker);
  const chance =
    spread > 0
      ? Math.min(100, Math.max(0, base - spread + randomInt(state, spread * 2 + 1)))
      : base;
  emit(bus, { type: 'attackDeclared', attacker: attackerId, target: targetId, chance });
  // A rule reacting to ANGRIFF may have changed the situation.
  if (!attacker.alive || !target.alive || state.status !== 'playing') return;
  const roll = randomFloat(state) * 100;
  const hit = roll < chance;
  const stats = state.stats[attackerId];
  if (stats) {
    stats.attacks += 1;
    if (hit) stats.hits += 1;
    else stats.misses += 1;
  }
  log(state, hit ? 'log.hit' : 'log.miss', { attacker: attackerId, target: targetId, chance });
  emit(bus, { type: 'wheelResolved', attacker: attackerId, target: targetId, chance, roll, hit });
  if (!hit || !target.alive) return;
  const shield = target.statuses.findIndex((s) => s.kind === 'shield');
  if (shield >= 0) {
    target.statuses.splice(shield, 1);
    log(state, 'log.shieldBlocked', { figure: targetId });
    return;
  }
  damageFigure(bus, targetId, 1, 'attack', attackerId);
}
