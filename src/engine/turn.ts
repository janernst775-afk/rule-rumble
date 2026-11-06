// Mutating helpers that operate on a reducer draft (never on a shared state).
import type { Figure, FigureId, GameEvent, GameResult, GameState, LogEntry } from './types';

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

export function startRound(state: GameState, events: GameEvent[]): void {
  state.round += 1;
  state.turn = { order: buildTurnOrder(state), index: 0, phase: 'move' };
  events.push({ type: 'roundStarted', round: state.round });
  log(state, 'log.roundStarted', { round: state.round });
  beginTurnAtIndex(state, events);
}

/** Starts the turn at turn.index, skipping dead figures; ends the round if none is left. */
function beginTurnAtIndex(state: GameState, events: GameEvent[]): void {
  while (state.turn.index < state.turn.order.length) {
    const id = state.turn.order[state.turn.index];
    const fig = id ? state.figures[id] : undefined;
    if (fig && fig.alive) {
      state.turn.phase = 'move';
      events.push({ type: 'turnStarted', figure: fig.id });
      return;
    }
    state.turn.index += 1;
  }
  endRound(state, events);
}

export function endTurn(state: GameState, events: GameEvent[]): void {
  const id = state.turn.order[state.turn.index];
  if (id) events.push({ type: 'turnEnded', figure: id });
  if (checkVictory(state, events)) return;
  state.turn.index += 1;
  beginTurnAtIndex(state, events);
}

function endRound(state: GameState, events: GameEvent[]): void {
  events.push({ type: 'roundEnded', round: state.round });
  tickStatuses(state);
  const limit = state.settings.tempo.roundLimit;
  if (limit && state.round >= limit.rounds) {
    const bossFig = Object.values(state.figures).find((f) => f.kind === 'boss');
    finishGame(state, events, {
      winner: limit.outcome === 'boss' ? 'boss' : 'draw',
      winners: limit.outcome === 'boss' && bossFig ? [bossFig.id] : [],
      reason: 'roundLimit',
    });
    return;
  }
  startRound(state, events);
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
  state: GameState,
  events: GameEvent[],
  targetId: FigureId,
  amount: number,
  source: 'attack' | 'rule',
  attackerId: FigureId | null,
): void {
  const target = state.figures[targetId];
  if (!target || !target.alive || amount <= 0) return;
  const dealt = Math.min(amount, target.hp);
  target.hp -= dealt;
  events.push({ type: 'damaged', figure: targetId, amount: dealt, source });
  const targetStats = state.stats[targetId];
  if (targetStats) targetStats.damageTaken += dealt;
  if (attackerId) {
    const attackerStats = state.stats[attackerId];
    if (attackerStats) attackerStats.damageDealt += dealt;
  }
  if (target.hp <= 0) {
    target.alive = false;
    events.push({ type: 'died', figure: targetId, pos: { ...target.pos } });
    log(state, 'log.died', { figure: targetId });
  }
}

/** Evaluates win conditions (SPEC 2). Returns true if the game is over. */
export function checkVictory(state: GameState, events: GameEvent[]): boolean {
  if (state.status === 'over') return true;
  const all = Object.values(state.figures);
  const bossFig = all.find((f) => f.kind === 'boss');
  const aliveHeroes = all.filter((f) => f.kind === 'hero' && f.alive);
  const bossDead = !bossFig || !bossFig.alive;
  if (bossDead && aliveHeroes.length === 0) {
    finishGame(state, events, { winner: 'draw', winners: [], reason: 'simultaneous' });
    return true;
  }
  if (bossDead) {
    finishGame(state, events, {
      winner: 'heroes',
      winners: aliveHeroes.map((h) => h.id),
      reason: 'bossDied',
    });
    return true;
  }
  if (aliveHeroes.length === 0) {
    finishGame(state, events, { winner: 'boss', winners: [bossFig.id], reason: 'heroesDied' });
    return true;
  }
  return false;
}

function finishGame(state: GameState, events: GameEvent[], result: GameResult): void {
  state.status = 'over';
  state.result = result;
  events.push({ type: 'gameOver', result });
  log(state, `log.gameOver.${result.winner}`, { reason: result.reason });
}
