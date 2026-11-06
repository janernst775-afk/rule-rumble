// All primitives that rules (and later custom effects and pro code) may use to change
// the world (CLAUDE.md rule 3). Every primitive enforces the limits from Settings and
// the fixed protection rules (SPEC 6) itself – callers cannot bypass them.
import {
  createTile,
  DIRECTIONS,
  hasTile,
  orthogonalPositions,
  parseKey,
  samePos,
  tileKey,
} from './board';
import { emit, type Bus } from './bus';
import { COMEBACK_DODGE_PERCENT, RULE_LIMITS } from './limits';
import { stepFigure } from './movement';
import { randomFloat, randomPick } from './rng';
import { emptyStats } from './stats';
import { removeTileError, tileCount } from './tiles';
import { damageFigure, log } from './turn';
import type { FigureId, NpcType, Pos, Status, TileType } from './types';

function alive(bus: Bus, id: FigureId) {
  const fig = bus.state.figures[id];
  return fig && fig.alive ? fig : null;
}

function clampInt(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(v)));
}

/** Rule damage: max 1 per effect, capped per figure and round, comeback dodge. */
export function ruleDamage(bus: Bus, id: FigureId, amount: number): void {
  const state = bus.state;
  const fig = alive(bus, id);
  if (!fig) return;
  const dmg = Math.min(amount, RULE_LIMITS.maxAmountPerEffect);
  if (dmg <= 0) return;
  const taken = state.ruleDamage[id] ?? 0;
  if (taken >= state.settings.rules.ruleDamagePerFigurePerRound) {
    log(state, 'log.damageCapped', { figure: id });
    emit(bus, { type: 'damageCapped', figure: id });
    return;
  }
  if (state.settings.combat.comeback && fig.hp === 1) {
    if (randomFloat(state) * 100 < COMEBACK_DODGE_PERCENT) {
      log(state, 'log.dodged', { figure: id });
      emit(bus, { type: 'dodged', figure: id });
      return;
    }
  }
  state.ruleDamage[id] = taken + dmg;
  damageFigure(bus, id, dmg, 'rule', null);
}

/** HEILE: max 1 per effect, never above max life (max life cannot change). */
export function heal(bus: Bus, id: FigureId, amount: number): void {
  const fig = alive(bus, id);
  if (!fig) return;
  const healed = Math.min(amount, RULE_LIMITS.maxAmountPerEffect, fig.maxHp - fig.hp);
  if (healed <= 0) return;
  fig.hp += healed;
  log(bus.state, 'log.healed', { figure: id });
  emit(bus, { type: 'healed', figure: id, amount: healed });
}

function addStatus(bus: Bus, id: FigureId, status: Status): void {
  const fig = alive(bus, id);
  if (!fig) return;
  fig.statuses.push(status);
  emit(bus, { type: 'statusAdded', figure: id, status });
}

/** BEWEGUNG ±n FÜR r RUNDEN – the effective move stays within 0..3 (query.effectiveMove). */
export function moveModifier(bus: Bus, id: FigureId, delta: number, rounds: number): void {
  const L = RULE_LIMITS;
  addStatus(bus, id, {
    kind: 'moveMod',
    delta: clampInt(delta, L.moveDelta.min, L.moveDelta.max),
    rounds: clampInt(rounds, L.statusRounds.min, L.statusRounds.max),
  });
}

/** RADCHANCE ±n% FÜR r RUNDEN – the effective chance stays within 25..75 % (query). */
export function wheelModifier(bus: Bus, id: FigureId, delta: number, rounds: number): void {
  const L = RULE_LIMITS;
  addStatus(bus, id, {
    kind: 'wheelMod',
    delta: clampInt(delta, L.wheelDelta.min, L.wheelDelta.max),
    rounds: clampInt(rounds, L.statusRounds.min, L.statusRounds.max),
  });
}

/** SCHILD: blocks the next wheel hit. A figure holds at most one shield. */
export function shield(bus: Bus, id: FigureId): void {
  const fig = alive(bus, id);
  if (!fig || fig.statuses.some((s) => s.kind === 'shield')) return;
  addStatus(bus, id, { kind: 'shield', remaining: 1 });
}

/** AUSSETZEN: at most one turn, never two turns in a row for the same figure. */
export function skipTurn(bus: Bus, id: FigureId): void {
  const fig = alive(bus, id);
  if (!fig) return;
  if (fig.statuses.some((s) => s.kind === 'skip' || s.kind === 'skipCooldown')) return;
  addStatus(bus, id, { kind: 'skip', remaining: RULE_LIMITS.maxSkipTurns });
}

/** TELEPORT ZUFÄLLIG: jump to a random other tile. */
export function teleportRandom(bus: Bus, id: FigureId): void {
  const fig = alive(bus, id);
  if (!fig) return;
  const options = Object.keys(bus.state.tiles)
    .map(parseKey)
    .filter((p) => !samePos(p, fig.pos));
  const to = randomPick(bus.state, options);
  if (to) stepFigure(bus, id, to);
}

/**
 * SCHIEBE ziel WEG_VON feld 1: one tile away from `from`. If the figure stands on
 * `from`, the direction is random; without a tile there, nothing happens.
 */
export function push(bus: Bus, id: FigureId, from: Pos): void {
  const fig = alive(bus, id);
  if (!fig) return;
  let dir = { x: Math.sign(fig.pos.x - from.x), y: Math.sign(fig.pos.y - from.y) };
  if (dir.x !== 0 && dir.y !== 0) {
    // Diagonal offset: push along the larger axis (orthogonal movement only).
    if (Math.abs(fig.pos.x - from.x) >= Math.abs(fig.pos.y - from.y)) dir = { x: dir.x, y: 0 };
    else dir = { x: 0, y: dir.y };
  }
  if (dir.x === 0 && dir.y === 0) dir = randomPick(bus.state, DIRECTIONS) ?? { x: 1, y: 0 };
  const to = { x: fig.pos.x + dir.x, y: fig.pos.y + dir.y };
  if (!hasTile(bus.state.tiles, to)) return;
  stepFigure(bus, id, to);
}

/** MACHE feld ZU typ */
export function setTileType(bus: Bus, pos: Pos, tileType: TileType): void {
  const tile = bus.state.tiles[tileKey(pos)];
  if (!tile || tile.type === tileType) return;
  tile.type = tileType;
  emit(bus, { type: 'tileTypeChanged', pos: { ...pos }, tileType });
}

/** ENTFERNE feld – board limits and connectivity apply as for players. */
export function removeTileByRule(bus: Bus, pos: Pos): void {
  if (removeTileError(bus.state, pos) !== null) return;
  delete bus.state.tiles[tileKey(pos)];
  emit(bus, { type: 'tileRemoved', figure: null, pos: { ...pos } });
}

/** ANLEGE NEBEN feld – a new tile on a random free orthogonal neighbour. */
export function addTileNear(bus: Bus, pos: Pos): void {
  const state = bus.state;
  if (tileCount(state) >= state.settings.board.maxTiles) return;
  const free = orthogonalPositions(pos).filter((p) => !hasTile(state.tiles, p));
  const at = randomPick(state, free);
  if (!at) return;
  state.tiles[tileKey(at)] = createTile(at);
  emit(bus, { type: 'tileAdded', figure: null, pos: at, textureId: null });
}

/** SPAWNE: limited by NPCs on the board and spawns per round (Settings). */
export function spawnNpc(bus: Bus, npcType: NpcType, pos: Pos, ruleId: string): void {
  const state = bus.state;
  if (!hasTile(state.tiles, pos)) return;
  const onBoard = Object.values(state.figures).filter((f) => f.kind === 'npc' && f.alive).length;
  if (
    onBoard >= state.settings.npcs.maxOnBoard ||
    state.spawnsThisRound >= state.settings.npcs.maxSpawnsPerRound
  ) {
    emit(bus, { type: 'spawnBlocked', rule: ruleId });
    return;
  }
  const id = `f${state.nextId++}`;
  state.figures[id] = {
    id,
    kind: 'npc',
    npcTypeId: npcType.id,
    pos: { ...pos },
    hp: npcType.hp,
    maxHp: npcType.hp,
    baseMove: npcType.move,
    vars: {},
    statuses: [],
    alive: true,
    joinedRound: state.round,
  };
  state.participants[id] = {
    figureId: id,
    name: npcType.name,
    avatar: { image: null, color: npcType.color },
    controller: 'npc',
    difficulty: null,
  };
  state.stats[id] = emptyStats();
  state.spawnsThisRound += 1;
  log(state, 'log.spawned', { figure: id });
  emit(bus, { type: 'spawned', figure: id, pos: { ...pos } });
}

/** SETZE: numbers only, always clamped to −1000..1000. */
export function setVariable(
  bus: Bus,
  scope: { figure: FigureId } | 'world',
  name: string,
  op: '=' | '+' | '-',
  value: number,
): void {
  const L = RULE_LIMITS.variable;
  const key = name.toLowerCase();
  const store =
    scope === 'world' ? bus.state.world : (bus.state.figures[scope.figure]?.vars ?? null);
  if (!store) return;
  const current = store[key] ?? 0;
  const next = op === '=' ? value : op === '+' ? current + value : current - value;
  store[key] = clampInt(next, L.min, L.max);
}

/** ZEIGE "…" – at most 80 characters. */
export function showMessage(bus: Bus, ruleId: string, text: string): void {
  emit(bus, { type: 'message', rule: ruleId, text: text.slice(0, RULE_LIMITS.maxMessageLength) });
}
