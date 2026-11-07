// Interpreter for rule conditions, rule effects and own effects from the effect workshop
// (SPEC 5.7). No JavaScript from player text: the AST is walked by this code only.
// Every world change goes through engine/primitives.ts. A step budget, a call-depth limit
// and a list limit stop runaway effects; changes made until then stay (SPEC 5.8).
import {
  manhattan,
  neighborTiles,
  orthogonalPositions,
  parseKey,
  samePos,
  tileKey,
} from '../engine/board';
import { emit, type Bus } from '../engine/bus';
import { EFFECT_LIMITS } from '../engine/limits';
import * as P from '../engine/primitives';
import { baseWheelChance, effectiveMove } from '../engine/query';
import { randomFloat, randomInt, randomPick } from '../engine/rng';
import type { ActiveRule, Figure, FigureId, GameState, Pos } from '../engine/types';
import type { EffectDef, Effect, Expr, FigureRef, Stmt, Target, TileRef, TileTarget } from './ast';

/** Values available to a rule while it handles one event. */
export interface RuleContext {
  trigger?: FigureId;
  attacker?: FigureId;
  target?: FigureId;
  tile?: Pos;
  fromTile?: Pos;
  amount?: number;
}

/** Runtime values of the effect language. */
export type Value =
  | number
  | string
  | boolean
  | null
  | { t: 'fig'; id: FigureId }
  | { t: 'tile'; pos: Pos }
  | { t: 'figs'; ids: FigureId[] }
  | { t: 'tiles'; pos: Pos[] };

export type AbortReason = 'steps' | 'depth' | 'list';

export class EffectAbort extends Error {
  constructor(readonly reason: AbortReason) {
    super(reason);
  }
}

/** Execution environment of one rule firing. */
export interface Env {
  bus: Bus;
  rule: ActiveRule;
  ctx: RuleContext;
  locals: Map<string, Value>;
  /** Shared by all nested calls of one firing. */
  budget: { steps: number };
  depth: number;
}

export function newEnv(bus: Bus, rule: ActiveRule, ctx: RuleContext): Env {
  return { bus, rule, ctx, locals: new Map(), budget: { steps: 0 }, depth: 0 };
}

function step(env: Env, n = 1): void {
  env.budget.steps += n;
  if (env.budget.steps > EFFECT_LIMITS.maxSteps) throw new EffectAbort('steps');
}

function checkList(len: number): void {
  if (len > EFFECT_LIMITS.maxListLength) throw new EffectAbort('list');
}

// ---------- helpers ----------

export function truthy(v: Value): boolean {
  return v === true;
}

function figureOf(state: GameState, ctx: RuleContext, ref: FigureRef): Figure | undefined {
  const id = ref === 'trigger' ? ctx.trigger : ref === 'attacker' ? ctx.attacker : ctx.target;
  return id ? state.figures[id] : undefined;
}

/** Reference position for relative targets: the event tile, else the trigger figure. */
export function anchorPos(state: GameState, ctx: RuleContext): Pos | undefined {
  if (ctx.tile) return ctx.tile;
  const id = ctx.trigger ?? ctx.attacker ?? ctx.target;
  return id ? state.figures[id]?.pos : undefined;
}

function tileOfRef(state: GameState, ctx: RuleContext, ref: TileRef): Pos | undefined {
  if (ref.kind === 'eventTile') return anchorPos(state, ctx);
  if (ref.kind === 'fromTile') return ctx.fromTile;
  return figureOf(state, ctx, ref.ref)?.pos;
}

/** Living figures in deterministic order (by id number). */
function livingFigures(state: GameState): Figure[] {
  return Object.values(state.figures)
    .filter((f) => f.alive)
    .sort((a, b) => Number(a.id.slice(1)) - Number(b.id.slice(1)));
}

function figureIds(v: Value): FigureId[] {
  if (v && typeof v === 'object') {
    if (v.t === 'fig') return [v.id];
    if (v.t === 'figs') return v.ids;
  }
  return [];
}

function tilePositions(v: Value): Pos[] {
  if (v && typeof v === 'object') {
    if (v.t === 'tile') return [v.pos];
    if (v.t === 'tiles') return v.pos;
  }
  return [];
}

function asNumber(v: Value): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

function asText(v: Value): string {
  return typeof v === 'string' ? v : '';
}

function valuePos(state: GameState, v: Value): Pos | undefined {
  if (v && typeof v === 'object') {
    if (v.t === 'tile') return v.pos;
    if (v.t === 'fig') return state.figures[v.id]?.pos;
  }
  return undefined;
}

// ---------- expressions ----------

function figureProp(state: GameState, f: Figure, prop: string): Value {
  switch (prop) {
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
    case 'tile':
      return { t: 'tile', pos: { ...f.pos } };
    default:
      return f.vars[prop.toLowerCase()] ?? 0;
  }
}

function tileProp(state: GameState, pos: Pos, prop: string): Value {
  const tile = state.tiles[tileKey(pos)];
  switch (prop) {
    case 'type':
      return tile?.type ?? '';
    case 'figureCount':
      return livingFigures(state).filter((f) => samePos(f.pos, pos)).length;
    case 'texture':
      return (tile?.textureId ? (state.textureNames[tile.textureId] ?? '') : '').toLowerCase();
    default:
      return null;
  }
}

function query(env: Env, name: string, args: Value[]): Value {
  const state = env.bus.state;
  const tiles = () => Object.keys(state.tiles).map(parseKey);
  switch (name) {
    case 'figuresOn': {
      const pos = valuePos(state, args[0] ?? null);
      return {
        t: 'figs',
        ids: pos
          ? livingFigures(state)
              .filter((f) => samePos(f.pos, pos))
              .map((f) => f.id)
          : [],
      };
    }
    case 'neighborTiles': {
      const pos = valuePos(state, args[0] ?? null);
      const radius = Math.min(
        EFFECT_LIMITS.maxRadius,
        Math.max(1, Math.round(asNumber(args[1] ?? 1))),
      );
      if (!pos) return { t: 'tiles', pos: [] };
      const found = tiles().filter((p) => {
        const d = manhattan(p, pos);
        return d >= 1 && d <= radius;
      });
      step(env, found.length);
      return { t: 'tiles', pos: found };
    }
    case 'tilesOfType':
      return {
        t: 'tiles',
        pos: Object.values(state.tiles)
          .filter((x) => x.type === asText(args[0] ?? ''))
          .map((x) => x.pos),
      };
    case 'tilesWithTexture': {
      const wanted = asText(args[0] ?? '').toLowerCase();
      return {
        t: 'tiles',
        pos: Object.values(state.tiles)
          .filter(
            (x) => x.textureId && (state.textureNames[x.textureId] ?? '').toLowerCase() === wanted,
          )
          .map((x) => x.pos),
      };
    }
    case 'emptyTiles': {
      const occupied = livingFigures(state).map((f) => f.pos);
      return { t: 'tiles', pos: tiles().filter((p) => !occupied.some((o) => samePos(o, p))) };
    }
    case 'allFigures':
      return { t: 'figs', ids: livingFigures(state).map((f) => f.id) };
    case 'allNpcs':
      return {
        t: 'figs',
        ids: livingFigures(state)
          .filter((f) => f.kind === 'npc')
          .map((f) => f.id),
      };
    case 'nearestFigure': {
      const pos = valuePos(state, args[0] ?? null);
      if (!pos) return null;
      let best: Figure | undefined;
      for (const f of livingFigures(state)) {
        if (!best || manhattan(f.pos, pos) < manhattan(best.pos, pos)) best = f;
      }
      return best ? { t: 'fig', id: best.id } : null;
    }
    case 'distance': {
      const a = valuePos(state, args[0] ?? null);
      const b = valuePos(state, args[1] ?? null);
      return a && b ? manhattan(a, b) : 0;
    }
    case 'randomNumber': {
      const lo = Math.round(asNumber(args[0] ?? 1));
      const hi = Math.round(asNumber(args[1] ?? 6));
      const min = Math.min(lo, hi);
      const max = Math.max(lo, hi);
      return min + randomInt(state, Math.min(1000, max - min + 1));
    }
    case 'count': {
      const v = args[0] ?? null;
      return figureIds(v).length + tilePositions(v).length;
    }
    default:
      return null;
  }
}

export function evaluate(env: Env, e: Expr): Value {
  step(env);
  const state = env.bus.state;
  const ctx = env.ctx;
  switch (e.kind) {
    case 'num':
      return e.value;
    case 'str':
      return e.value.toLowerCase();
    case 'none':
      return null;
    case 'figureProp': {
      const f = figureOf(state, ctx, e.ref);
      return f ? figureProp(state, f, e.prop) : null;
    }
    case 'figureVar':
      return figureOf(state, ctx, e.ref)?.vars[e.name.toLowerCase()] ?? 0;
    case 'tileProp': {
      const pos = tileOfRef(state, ctx, e.tile);
      return pos ? tileProp(state, pos, e.prop) : '';
    }
    case 'global':
      if (e.name === 'round') return state.round;
      if (e.name === 'tileCount') return Object.keys(state.tiles).length;
      return livingFigures(state).filter((f) => f.kind === 'npc').length;
    case 'worldVar':
      return state.world[e.name.toLowerCase()] ?? 0;
    case 'amount':
      return ctx.amount ?? 0;
    case 'chance':
      return randomFloat(state) * 100 < e.percent;
    case 'not':
      return !truthy(evaluate(env, e.item));
    case 'and':
      return e.items.every((i) => truthy(evaluate(env, i)));
    case 'or':
      return e.items.some((i) => truthy(evaluate(env, i)));
    case 'cmp': {
      const l = evaluate(env, e.left);
      const r = evaluate(env, e.right);
      if (e.op === '=' || e.op === '!=') {
        const same = sameValue(l, r);
        return e.op === '=' ? same : !same;
      }
      if (typeof l !== 'number' || typeof r !== 'number') return false;
      switch (e.op) {
        case '<':
          return l < r;
        case '>':
          return l > r;
        case '<=':
          return l <= r;
        case '>=':
          return l >= r;
      }
      return false;
    }
    case 'var':
      return env.locals.get(e.name.toLowerCase()) ?? null;
    case 'varProp': {
      const v = env.locals.get(e.name.toLowerCase()) ?? null;
      if (v && typeof v === 'object' && v.t === 'fig') {
        const f = state.figures[v.id];
        return f ? figureProp(state, f, e.prop) : null;
      }
      if (v && typeof v === 'object' && v.t === 'tile') return tileProp(state, v.pos, e.prop);
      return null;
    }
    case 'query': {
      const args = e.args.map((a) => evaluate(env, a));
      const result = query(env, e.name, args);
      checkList(figureIds(result).length + tilePositions(result).length);
      return result;
    }
    case 'figureRef': {
      const f = figureOf(state, ctx, e.ref);
      return f ? { t: 'fig', id: f.id } : null;
    }
    case 'tileRef': {
      const pos = tileOfRef(state, ctx, e.tile);
      return pos ? { t: 'tile', pos: { ...pos } } : null;
    }
    case 'targets':
      return { t: 'figs', ids: resolveTargets(env, e.target) };
    case 'tiles':
      return { t: 'tiles', pos: resolveTiles(env, e.target) };
  }
}

function sameValue(a: Value, b: Value): boolean {
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    if (a.t === 'fig' && b.t === 'fig') return a.id === b.id;
    if (a.t === 'tile' && b.t === 'tile') return samePos(a.pos, b.pos);
    return false;
  }
  return a === b;
}

// ---------- targets ----------

function anchorFigure(ctx: RuleContext): FigureId | undefined {
  return ctx.trigger ?? ctx.attacker;
}

export function resolveTargets(env: Env, t: Target): FigureId[] {
  const state = env.bus.state;
  const ctx = env.ctx;
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
      let best: Figure | undefined;
      for (const f of living.filter((x) => x.id !== self)) {
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
    case 'value':
      return figureIds(evaluate(env, t.expr)).filter((id) => state.figures[id]?.alive);
  }
}

export function resolveTiles(env: Env, t: TileTarget): Pos[] {
  const state = env.bus.state;
  const ctx = env.ctx;
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
    case 'value':
      return tilePositions(evaluate(env, t.expr)).filter((p) => state.tiles[tileKey(p)]);
  }
}

// ---------- effects ----------

/** Executes one effect (rule DANN line or effect step) through the primitives. */
export function execEffect(env: Env, e: Effect): void {
  const bus = env.bus;
  const state = bus.state;
  const each = (target: Target, fn: (id: FigureId) => void) => {
    for (const id of resolveTargets(env, target)) {
      if (state.status !== 'playing') return;
      step(env);
      fn(id);
    }
  };
  const eachTile = (target: TileTarget, fn: (pos: Pos) => void) => {
    for (const pos of resolveTiles(env, target)) {
      if (state.status !== 'playing') return;
      step(env);
      fn(pos);
    }
  };
  switch (e.kind) {
    case 'spawn': {
      const type = state.npcTypes.find((n) => n.id === e.npcType);
      if (type) eachTile(e.at, (pos) => P.spawnNpc(bus, type, pos, env.rule.id));
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
      const from = resolveTiles(env, e.from)[0] ?? anchorPos(state, env.ctx);
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
      const value = asNumber(evaluate(env, e.value));
      if (e.scope.kind === 'world') {
        P.setVariable(bus, 'world', e.name, e.op, value);
        return;
      }
      return each(e.scope.target, (id) => P.setVariable(bus, { figure: id }, e.name, e.op, value));
    }
    case 'message':
      P.showMessage(bus, env.rule.id, e.text);
      return;
    case 'call':
      return callEffect(
        env,
        e.effect,
        e.args.map((a) => evaluate(env, a)),
      );
  }
}

function findEffect(state: GameState, name: string): EffectDef | undefined {
  const n = name.toLowerCase();
  return state.effects.find((d) => d.name.toLowerCase() === n);
}

/** Calls an own effect with evaluated arguments (call depth max. 5). */
export function callEffect(env: Env, name: string, args: Value[]): void {
  const def = findEffect(env.bus.state, name);
  if (!def) return;
  if (env.depth >= EFFECT_LIMITS.maxCallDepth) throw new EffectAbort('depth');
  const locals = new Map<string, Value>();
  def.params.forEach((p, i) => locals.set(p.name.toLowerCase(), args[i] ?? null));
  const inner: Env = { ...env, locals, depth: env.depth + 1 };
  runStmts(inner, def.body);
}

function runStmts(env: Env, stmts: Stmt[]): void {
  for (const s of stmts) {
    if (env.bus.state.status !== 'playing') return;
    runStmt(env, s);
  }
}

function runStmt(env: Env, s: Stmt): void {
  step(env);
  const bus = env.bus;
  switch (s.kind) {
    case 'do':
      execEffect(env, s.effect);
      return;
    case 'if':
      runStmts(env, truthy(evaluate(env, s.cond)) ? s.then : s.else);
      return;
    case 'repeat': {
      const times = Math.min(
        EFFECT_LIMITS.maxRepeat,
        Math.max(0, Math.round(asNumber(evaluate(env, s.times)))),
      );
      for (let i = 0; i < times; i++) runStmts(env, s.body);
      return;
    }
    case 'forEach': {
      const v = evaluate(env, s.in);
      const items: Value[] = [
        ...figureIds(v).map((id) => ({ t: 'fig', id }) as const),
        ...tilePositions(v).map((pos) => ({ t: 'tile', pos }) as const),
      ];
      checkList(items.length);
      const key = s.var.toLowerCase();
      const before = env.locals.get(key);
      for (const item of items) {
        env.locals.set(key, item);
        runStmts(env, s.body);
      }
      if (before === undefined) env.locals.delete(key);
      else env.locals.set(key, before);
      return;
    }
    case 'pick': {
      const v = evaluate(env, s.from);
      const ids = figureIds(v);
      const tiles = tilePositions(v);
      let picked: Value = null;
      if (ids.length > 0) {
        const id = randomPick(bus.state, ids);
        picked = id ? { t: 'fig', id } : null;
      } else if (tiles.length > 0) {
        const pos = randomPick(bus.state, tiles);
        picked = pos ? { t: 'tile', pos } : null;
      }
      env.locals.set(s.var.toLowerCase(), picked);
      return;
    }
    case 'let':
      env.locals.set(s.name.toLowerCase(), evaluate(env, s.value));
      return;
    case 'play': {
      const sound = asText(evaluate(env, s.sound));
      if (sound) emit(bus, { type: 'soundPlayed', rule: env.rule.id, sound });
      return;
    }
    case 'texture': {
      const name = asText(evaluate(env, s.name));
      for (const pos of tilePositions(evaluate(env, s.tile))) P.setTextureByName(bus, pos, name);
      return;
    }
    case 'wait':
      emit(bus, {
        type: 'waited',
        rule: env.rule.id,
        seconds: Math.min(EFFECT_LIMITS.maxWait, Math.max(0, s.seconds)),
      });
      return;
  }
}
