// Round and turn flow. All helpers mutate a reducer draft through the bus.
import { emit, type Bus } from './bus';
import { activateRules, expireRules } from './rules';
import type { Figure, FigureId, GameResult, GameState, LogEntry } from './types';

export function log(state: GameState, key: string, params: LogEntry['params'] = {}): void {
  state.log.push({ round: state.round, key, params });
}

/** Heroes in seat order, then the boss, then NPCs in order of appearance (SPEC 3). */
export function buildTurnOrder(state: GameState): FigureId[] {
  const seated = state.seatOrder
    .map((id) => state.figures[id])
    .filter((f): f is Figure => f !== undefined && f.alive);
  const heroes = seated.filter((f) => f.kind === 'hero');
  const bosses = seated.filter((f) => f.kind === 'boss');
  // NPCs spawned this round only act from the next round on.
  const npcs = Object.values(state.figures)
    .filter((f) => f.kind === 'npc' && f.alive && f.joinedRound < state.round)
    .sort((a, b) => a.joinedRound - b.joinedRound || idNumber(a.id) - idNumber(b.id));
  return [...heroes, ...bosses, ...npcs].map((f) => f.id);
}

function idNumber(id: FigureId): number {
  return Number(id.replace(/\D/g, '')) || 0;
}

export function startRound(bus: Bus): void {
  const state = bus.state;
  state.round += 1;
  state.ruleDamage = {};
  state.spawnsThisRound = 0;
  for (const rule of state.rules) rule.firedThisRound = 0;
  state.turn = {
    order: buildTurnOrder(state),
    index: 0,
    phase: 'move',
    tileActionsUsed: 0,
    effectsUsed: 0,
  };
  log(state, 'log.roundStarted', { round: state.round });
  // Rules added in an earlier round become active now (SPEC 3, step 1).
  activateRules(bus);
  emit(bus, { type: 'roundStarted', round: state.round });
  if (checkVictory(bus)) return;
  beginTurnAtIndex(bus);
}

function resetTurnCounters(state: GameState): void {
  state.turn.phase = 'move';
  state.turn.tileActionsUsed = 0;
  state.turn.effectsUsed = 0;
  for (const rule of state.rules) rule.firedThisTurn = 0;
}

/**
 * Starts the turn at turn.index. Dead figures are skipped, figures with AUSSETZEN
 * lose their turn; if nobody is left, the round ends.
 */
function beginTurnAtIndex(bus: Bus): void {
  const state = bus.state;
  while (state.status === 'playing' && state.turn.index < state.turn.order.length) {
    const id = state.turn.order[state.turn.index];
    const fig = id ? state.figures[id] : undefined;
    if (fig && fig.alive) {
      resetTurnCounters(state);
      const skip = fig.statuses.findIndex((s) => s.kind === 'skip');
      if (skip >= 0) {
        fig.statuses.splice(skip, 1);
        fig.statuses.push({ kind: 'skipCooldown' });
        log(state, 'log.turnSkipped', { figure: fig.id });
        emit(bus, { type: 'turnSkipped', figure: fig.id });
        state.turn.index += 1;
        continue;
      }
      emit(bus, { type: 'turnStarted', figure: fig.id });
      if (checkVictory(bus)) return;
      // A rule may have killed the figure at its turn start.
      if (fig.alive) return;
    }
    state.turn.index += 1;
  }
  if (state.status === 'playing') endRound(bus);
}

export function endTurn(bus: Bus): void {
  const state = bus.state;
  const id = state.turn.order[state.turn.index];
  const fig = id ? state.figures[id] : undefined;
  if (id) emit(bus, { type: 'turnEnded', figure: id });
  // The cooldown lasts until the figure has played one normal turn.
  if (fig) fig.statuses = fig.statuses.filter((s) => s.kind !== 'skipCooldown');
  if (checkVictory(bus)) return;
  state.turn.index += 1;
  beginTurnAtIndex(bus);
}

function endRound(bus: Bus): void {
  const state = bus.state;
  emit(bus, { type: 'roundEnded', round: state.round });
  if (checkVictory(bus)) return;
  tickStatuses(state);
  expireRules(bus);
  const limit = state.settings.tempo.roundLimit;
  if (limit && state.round >= limit.rounds) {
    const bossFig = Object.values(state.figures).find((f) => f.kind === 'boss');
    finishGame(bus, {
      winner: limit.outcome === 'boss' ? 'boss' : 'draw',
      winners: limit.outcome === 'boss' && bossFig ? [bossFig.id] : [],
      reason: 'roundLimit',
    });
    return;
  }
  startRound(bus);
}

/** Round-based statuses count down at round end (SPEC 3, step 4). */
function tickStatuses(state: GameState): void {
  for (const fig of Object.values(state.figures)) {
    fig.statuses = fig.statuses
      .map((s) =>
        s.kind === 'moveMod' || s.kind === 'wheelMod' ? { ...s, rounds: s.rounds - 1 } : s,
      )
      .filter((s) => !((s.kind === 'moveMod' || s.kind === 'wheelMod') && s.rounds <= 0));
  }
}

export function damageFigure(
  bus: Bus,
  targetId: FigureId,
  amount: number,
  source: 'attack' | 'rule',
  attackerId: FigureId | null,
): void {
  const state = bus.state;
  const target = state.figures[targetId];
  if (!target || !target.alive || amount <= 0) return;
  const dealt = Math.min(amount, target.hp);
  target.hp -= dealt;
  const targetStats = state.stats[targetId];
  if (targetStats) targetStats.damageTaken += dealt;
  if (attackerId) {
    const attackerStats = state.stats[attackerId];
    if (attackerStats) attackerStats.damageDealt += dealt;
  }
  const died = target.hp <= 0;
  if (died) {
    target.alive = false;
    log(state, 'log.died', { figure: targetId });
  }
  emit(bus, { type: 'damaged', figure: targetId, amount: dealt, source });
  if (died) emit(bus, { type: 'died', figure: targetId, pos: { ...target.pos } });
}

/** Evaluates win conditions (SPEC 2). Returns true if the game is over. */
export function checkVictory(bus: Bus): boolean {
  const state = bus.state;
  if (state.status === 'over') return true;
  const all = Object.values(state.figures);
  const bossFig = all.find((f) => f.kind === 'boss');
  const aliveHeroes = all.filter((f) => f.kind === 'hero' && f.alive);
  const bossDead = !bossFig || !bossFig.alive;
  if (bossDead && aliveHeroes.length === 0) {
    finishGame(bus, { winner: 'draw', winners: [], reason: 'simultaneous' });
    return true;
  }
  if (bossDead) {
    finishGame(bus, {
      winner: 'heroes',
      winners: aliveHeroes.map((h) => h.id),
      reason: 'bossDied',
    });
    return true;
  }
  if (aliveHeroes.length === 0) {
    finishGame(bus, { winner: 'boss', winners: [bossFig.id], reason: 'heroesDied' });
    return true;
  }
  return false;
}

function finishGame(bus: Bus, result: GameResult): void {
  const state = bus.state;
  state.status = 'over';
  state.result = result;
  log(state, `log.gameOver.${result.winner}`, { reason: result.reason });
  emit(bus, { type: 'gameOver', result });
}
