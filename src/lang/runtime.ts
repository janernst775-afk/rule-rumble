// Connects rules with game events (SPEC 5.6). Active rules react in the order they were
// added; effects only change the world through engine/primitives.ts. Chain depth and
// the effect budget per turn are enforced here (SPEC 6.2).
import {
  manhattan,
  neighborTiles,
  orthogonalPositions,
  parseKey,
  samePos,
  tileKey,
} from '../engine/board';
import type { Bus } from '../engine/bus';
import { CHAIN_LIMITS } from '../engine/limits';
import * as P from '../engine/primitives';
import { baseWheelChance, effectiveMove } from '../engine/query';
import { randomFloat, randomPick } from '../engine/rng';
import { isRuleActive } from '../engine/rules';
import { emit } from '../engine/bus';
import type { ActiveRule, Figure, FigureId, GameEvent, GameState, Pos } from '../engine/types';
import type { Effect, Expr, FigureRef, Target, TileRef, TileTarget, Trigger } from './ast';

/** Values available to a rule while it handles one event. */
export interface RuleContext {
  trigger?: FigureId;
  attacker?: FigureId;
  target?: FigureId;
  tile?: Pos;
  fromTile?: Pos;
  amount?: number;
}

/** Maps an engine event to the trigger kind(s) it raises and their context. */
function contextFor(
  event: GameEvent,
): { matches: (t: Trigger, s: GameState) => boolean; ctx: RuleContext } | null {
  switch (event.type) {
    case 'roundStarted':
      return {
        matches: (t, s) =>
          t.kind === 'roundStart' || (t.kind === 'everyNRounds' && s.round % t.n === 0),
        ctx: {},
      };
    case 'roundEnded':
      return { matches: (t) => t.kind === 'roundEnd', ctx: {} };
    case 'turnStarted':
      return { matches: (t) => t.kind === 'turnStart', ctx: { trigger: event.figure } };
    case 'turnEnded':
      return { matches: (t) => t.kind === 'turnEnd', ctx: { trigger: event.figure } };
    case 'tileEntered':
      return {
        matches: (t) => t.kind === 'enters' && (!t.newOnly || event.firstVisit),
        ctx: { trigger: event.figure, tile: event.pos, fromTile: event.from },
      };
    case 'tileLeft':
      return {
        matches: (t) => t.kind === 'leaves',
        ctx: { trigger: event.figure, tile: event.pos, fromTile: event.pos },
      };
    case 'attackDeclared':
      return {
        matches: (t) => t.kind === 'attack',
        ctx: { attacker: event.attacker, target: event.target },
      };
    case 'wheelResolved':
      return {
        matches: (t) => t.kind === (event.hit ? 'hit' : 'miss'),
        ctx: { attacker: event.attacker, target: event.target },
      };
    case 'damaged':
      return {
        matches: (t) => t.kind === 'damage',
        ctx: { trigger: event.figure, amount: event.amount },
      };
    case 'died':
      return { matches: (t) => t.kind === 'dies', ctx: { trigger: event.figure, tile: event.pos } };
    case 'tileAdded':
      return {
        matches: (t) => t.kind === 'tileAdded',
        ctx: { trigger: event.figure ?? undefined, tile: event.pos },
      };
    case 'tileRemoved':
      return {
        matches: (t) => t.kind === 'tileRemoved',
        ctx: { trigger: event.figure ?? undefined, tile: event.pos },
      };
    default:
      return null;
  }
}

function limitReached(rule: ActiveRule): boolean {
  const limit = rule.def.ast.limit;
  if (!limit) return false;
  const used =
    limit.per === 'round'
      ? rule.firedThisRound
      : limit.per === 'turn'
        ? rule.firedThisTurn
        : rule.firedTotal;
  return used >= limit.count;
}

export function reactToEvent(bus: Bus, event: GameEvent): void {
  const mapped = contextFor(event);
  if (!mapped) return;
  const state = bus.state;
  // Snapshot: rules added or removed while reacting do not change this pass.
  const rules = state.rules.filter(
    (r) => isRuleActive(state, r) && mapped.matches(r.def.ast.trigger, state),
  );
  for (const rule of rules) {
    if (state.status !== 'playing') return;
    if (!state.rules.some((r) => r.id === rule.id)) continue;
    if (limitReached(rule)) continue;
    if (bus.depth >= CHAIN_LIMITS.maxDepth) {
      stop(bus, rule, 'depth');
      continue;
    }
    runRule(bus, rule, mapped.ctx);
  }
}

function stop(bus: Bus, rule: ActiveRule, reason: 'depth' | 'budget'): void {
  bus.state.log.push({
    round: bus.state.round,
    key: reason === 'depth' ? 'log.chainStoppedDepth' : 'log.chainStoppedBudget',
    params: { rule: rule.def.ast.name },
  });
  emit(bus, { type: 'chainStopped', rule: rule.id, name: rule.def.ast.name, reason });
}

function runRule(bus: Bus, rule: ActiveRule, ctx: RuleContext): void {
  const state = bus.state;
  const ast = rule.def.ast;
  const ok = ast.conditions.every((c) => truthy(evaluate(state, c, ctx)));
  const branch = ok ? ast.effects : ast.elseEffects;
  if (branch.length === 0) return;
  rule.firedThisRound += 1;
  rule.firedThisTurn += 1;
  rule.firedTotal += 1;
  state.log.push({ round: state.round, key: 'log.ruleFired', params: { rule: ast.name } });
  bus.events.push({ type: 'ruleFired', rule: rule.id, name: ast.name });
  bus.depth += 1;
  try {
    for (const effect of branch) {
      if (state.status !== 'playing') return;
      if (state.turn.effectsUsed >= CHAIN_LIMITS.maxEffectsPerTurn) {
        stop(bus, rule, 'budget');
        return;
      }
      state.turn.effectsUsed += 1;
      runEffect(bus, rule, effect, ctx);
    }
  } finally {
    bus.depth -= 1;
  }
}

// ---------- expressions ----------

type Value = number | string | boolean | null;

function truthy(v: Value): boolean {
  return v === true;
}

function figureOf(state: GameState, ctx: RuleContext, ref: FigureRef): Figure | undefined {
  const id = ref === 'trigger' ? ctx.trigger : ref === 'attacker' ? ctx.attacker : ctx.target;
  return id ? state.figures[id] : undefined;
}

function tileOfRef(state: GameState, ctx: RuleContext, ref: TileRef): Pos | undefined {
  if (ref.kind === 'eventTile') return ctx.tile ?? anchorPos(state, ctx);
  if (ref.kind === 'fromTile') return ctx.fromTile;
  return figureOf(state, ctx, ref.ref)?.pos;
}

function evaluate(state: GameState, e: Expr, ctx: RuleContext): Value {
  switch (e.kind) {
    case 'num':
      return e.value;
    case 'str':
      return e.value.toLowerCase();
    case 'figureProp': {
      const f = figureOf(state, ctx, e.ref);
      if (!f) return null;
      switch (e.prop) {
        case 'hp':
          return f.hp;
        case 'maxHp':
          return f.maxHp;
        case 'move':
          return effectiveMove(f);
        case 'wheelChance':
          return baseWheelChance(state, f);
        case 'shield':
          return f.statuses.some((s) => s.kind === 'shield') ? 1 : 0;
      }
      return null;
    }
    case 'figureVar':
      return figureOf(state, ctx, e.ref)?.vars[e.name.toLowerCase()] ?? 0;
    case 'tileProp': {
      const pos = tileOfRef(state, ctx, e.tile);
      const tile = pos ? state.tiles[tileKey(pos)] : undefined;
      if (e.prop === 'figureCount') {
        return pos
          ? Object.values(state.figures).filter((f) => f.alive && samePos(f.pos, pos)).length
          : 0;
      }
      if (!tile) return '';
      if (e.prop === 'type') return tile.type;
      return (tile.textureId ? (state.textureNames[tile.textureId] ?? '') : '').toLowerCase();
    }
    case 'global':
      if (e.name === 'round') return state.round;
      if (e.name === 'tileCount') return Object.keys(state.tiles).length;
      return Object.values(state.figures).filter((f) => f.kind === 'npc' && f.alive).length;
    case 'worldVar':
      return state.world[e.name.toLowerCase()] ?? 0;
    case 'amount':
      return ctx.amount ?? 0;
    case 'chance':
      return randomFloat(state) * 100 < e.percent;
    case 'not':
      return !truthy(evaluate(state, e.item, ctx));
    case 'and':
      return e.items.every((i) => truthy(evaluate(state, i, ctx)));
    case 'or':
      return e.items.some((i) => truthy(evaluate(state, i, ctx)));
    case 'cmp': {
      const l = evaluate(state, e.left, ctx);
      const r = evaluate(state, e.right, ctx);
      if (l === null || r === null) return false;
      switch (e.op) {
        case '=':
          return l === r;
        case '!=':
          return l !== r;
        case '<':
          return l < r;
        case '>':
          return l > r;
        case '<=':
          return l <= r;
        case '>=':
          return l >= r;
      }
    }
  }
  return null;
}

// ---------- targets ----------

/** Reference position for relative targets: the event tile, else the trigger figure. */
function anchorPos(state: GameState, ctx: RuleContext): Pos | undefined {
  if (ctx.tile) return ctx.tile;
  const id = ctx.trigger ?? ctx.attacker ?? ctx.target;
  return id ? state.figures[id]?.pos : undefined;
}

function anchorFigure(ctx: RuleContext): FigureId | undefined {
  return ctx.trigger ?? ctx.attacker;
}

/** Living figures in deterministic order (seat order, then NPCs by id). */
function livingFigures(state: GameState): Figure[] {
  return Object.values(state.figures)
    .filter((f) => f.alive)
    .sort((a, b) => Number(a.id.slice(1)) - Number(b.id.slice(1)));
}

function resolveTargets(state: GameState, t: Target, ctx: RuleContext): FigureId[] {
  const living = livingFigures(state);
  switch (t.kind) {
    case 'ref': {
      const f = figureOf(state, ctx, t.ref);
      return f && f.alive ? [f.id] : [];
    }
    case 'onTile': {
      const pos = anchorPos(state, ctx);
      return pos ? living.filter((f) => samePos(f.pos, pos)).map((f) => f.id) : [];
    }
    case 'neighbors': {
      const pos = anchorPos(state, ctx);
      if (!pos) return [];
      const around = orthogonalPositions(pos);
      return living.filter((f) => around.some((p) => samePos(p, f.pos))).map((f) => f.id);
    }
    case 'nearest': {
      const pos = anchorPos(state, ctx);
      if (!pos) return [];
      const self = anchorFigure(ctx);
      const others = living.filter((f) => f.id !== self);
      let best: Figure | undefined;
      for (const f of others) {
        if (!best || manhattan(f.pos, pos) < manhattan(best.pos, pos)) best = f;
      }
      return best ? [best.id] : [];
    }
    case 'random': {
      const pick = randomPick(state, living);
      return pick ? [pick.id] : [];
    }
    case 'all':
      return living.map((f) => f.id);
    case 'allNpcs':
      return living.filter((f) => f.kind === 'npc').map((f) => f.id);
  }
}

function resolveTiles(state: GameState, t: TileTarget, ctx: RuleContext): Pos[] {
  switch (t.kind) {
    case 'eventTile':
    case 'fromTile':
    case 'figureTile': {
      const pos = tileOfRef(state, ctx, t);
      return pos && state.tiles[tileKey(pos)] ? [pos] : [];
    }
    case 'neighborTiles': {
      const pos = anchorPos(state, ctx);
      return pos ? neighborTiles(state.tiles, pos) : [];
    }
    case 'randomTile': {
      const pick = randomPick(state, Object.keys(state.tiles).map(parseKey));
      return pick ? [pick] : [];
    }
    case 'randomEmptyTile': {
      const occupied = livingFigures(state).map((f) => f.pos);
      const empty = Object.keys(state.tiles)
        .map(parseKey)
        .filter((p) => !occupied.some((o) => samePos(o, p)));
      const pick = randomPick(state, empty);
      return pick ? [pick] : [];
    }
    case 'tilesOfType':
      return Object.values(state.tiles)
        .filter((tile) => tile.type === t.tileType)
        .map((tile) => tile.pos);
  }
}

// ---------- effects ----------

function runEffect(bus: Bus, rule: ActiveRule, e: Effect, ctx: RuleContext): void {
  const state = bus.state;
  const each = (target: Target, fn: (id: FigureId) => void) => {
    for (const id of resolveTargets(state, target, ctx)) {
      if (state.status !== 'playing') return;
      fn(id);
    }
  };
  const eachTile = (target: TileTarget, fn: (pos: Pos) => void) => {
    for (const pos of resolveTiles(state, target, ctx)) {
      if (state.status !== 'playing') return;
      fn(pos);
    }
  };
  switch (e.kind) {
    case 'spawn': {
      const type = state.npcTypes.find((n) => n.id === e.npcType);
      if (type) eachTile(e.at, (pos) => P.spawnNpc(bus, type, pos, rule.id));
      return;
    }
    case 'damage':
      return each(e.target, (id) => P.ruleDamage(bus, id, e.amount));
    case 'heal':
      return each(e.target, (id) => P.heal(bus, id, e.amount));
    case 'moveMod':
      return each(e.target, (id) => P.moveModifier(bus, id, e.delta, e.rounds));
    case 'wheelMod':
      return each(e.target, (id) => P.wheelModifier(bus, id, e.delta, e.rounds));
    case 'shield':
      return each(e.target, (id) => P.shield(bus, id));
    case 'skip':
      return each(e.target, (id) => P.skipTurn(bus, id));
    case 'teleport':
      return each(e.target, (id) => P.teleportRandom(bus, id));
    case 'push': {
      const from = resolveTiles(state, e.from, ctx)[0] ?? anchorPos(state, ctx);
      if (!from) return;
      return each(e.target, (id) => P.push(bus, id, from));
    }
    case 'setTileType':
      return eachTile(e.at, (pos) => P.setTileType(bus, pos, e.tileType));
    case 'removeTile':
      return eachTile(e.at, (pos) => P.removeTileByRule(bus, pos));
    case 'addTileNear':
      return eachTile(e.at, (pos) => P.addTileNear(bus, pos));
    case 'setVar': {
      const raw = evaluate(state, e.value, ctx);
      const value = typeof raw === 'number' ? raw : 0;
      if (e.scope.kind === 'world') {
        P.setVariable(bus, 'world', e.name, e.op, value);
        return;
      }
      return each(e.scope.target, (id) => P.setVariable(bus, { figure: id }, e.name, e.op, value));
    }
    case 'message':
      P.showMessage(bus, rule.id, e.text);
      return;
  }
}
