// Interpreter for rule conditions, rule effects, own effects (SPEC 5.7) and Profi-Code
// (SPEC 5.8). No JavaScript from player text: the AST is walked by this code only.
// Every world change goes through engine/primitives.ts. A step budget, call-depth limits
// and a list limit stop runaway code; changes made until then stay (SPEC 5.8).
import {
  manhattan,
  neighborTiles,
  orthogonalPositions,
  parseKey,
  samePos,
  tileKey,
} from '../engine/board';
import { emit, type Bus } from '../engine/bus';
import { CODE_LIMITS, EFFECT_LIMITS } from '../engine/limits';
import * as P from '../engine/primitives';
import { baseWheelChance, effectiveMove } from '../engine/query';
import { randomFloat, randomInt, randomPick } from '../engine/rng';
import type { EventContext, Figure, FigureId, GameState, Pos } from '../engine/types';
import type {
  EffectDef,
  Effect,
  Expr,
  FigureRef,
  FunctionDef,
  RuntimeValue,
  Stmt,
  Target,
  TileRef,
  TileTarget,
} from './ast';

/** Values available to a rule while it handles one event. */
export type RuleContext = EventContext;

/** Runtime values of the effect language. */
export type Value = RuntimeValue;

export type AbortReason = 'steps' | 'depth' | 'list';

export class EffectAbort extends Error {
  constructor(readonly reason: AbortReason) {
    super(reason);
  }
}

/** GIB ZURÜCK: leaves the running function with a value. */
export class Return {
  constructor(readonly value: Value) {}
}

/** One recorded step for the debugger (SPEC 5.8 "Schritt-für-Schritt"). */
export interface TraceStep {
  line: number;
  kind: Stmt['kind'];
  /** Steps of the budget used so far. */
  steps: number;
  /** Nesting of effect and function calls. */
  depth: number;
  locals: Record<string, Value>;
}

/** Who runs the code: a rule instance or an NPC (for events and the log). */
export interface CodeSource {
  id: string;
  name: string;
}

/** Execution environment of one rule firing. */
export interface Env {
  bus: Bus;
  source: CodeSource;
  ctx: RuleContext;
  locals: Map<string, Value>;
  /** Shared by all nested calls of one firing. */
  budget: { steps: number };
  /** Own effect calls (max. 5) */
  depth: number;
  /** Own function calls (max. 20) */
  fdepth: number;
  /** Inside a function: no world changes. */
  pure: boolean;
  trace: TraceStep[] | null;
}

export function newEnv(bus: Bus, source: CodeSource, ctx: RuleContext): Env {
  return {
    bus,
    source,
    ctx,
    locals: new Map(),
    budget: { steps: 0 },
    depth: 0,
    fdepth: 0,
    pure: false,
    trace: null,
  };
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
  const id = ctx.trigger ?? ctx.attacker ?? ctx.target ?? ctx.self;
  return id ? state.figures[id]?.pos : undefined;
}

function tileOfRef(state: GameState, ctx: RuleContext, ref: TileRef): Pos | undefined {
  if (ref.kind === 'eventTile') {
    if (ctx.self) return state.figures[ctx.self]?.pos;
    return anchorPos(state, ctx);
  }
  if (ref.kind === 'fromTile') return ctx.fromTile;
  return figureOf(state, ctx, ref.ref)?.pos;
}

/** Living figures in deterministic order (by id number). */
function livingFigures(state: GameState): Figure[] {
  return Object.values(state.figures)
    .filter((f) => f.alive)
    .sort((a, b) => Number(a.id.slice(1)) - Number(b.id.slice(1)));
}

/** Figures in a value: one figure, a set of figures or a list (Profi-Code). */
function figureIds(v: Value): FigureId[] {
  if (v && typeof v === 'object') {
    if (v.t === 'fig') return [v.id];
    if (v.t === 'figs') return v.ids;
    if (v.t === 'list') return v.items.flatMap(figureIds);
  }
  return [];
}

function tilePositions(v: Value): Pos[] {
  if (v && typeof v === 'object') {
    if (v.t === 'tile') return [v.pos];
    if (v.t === 'tiles') return v.pos;
    if (v.t === 'list') return v.items.flatMap(tilePositions);
  }
  return [];
}

/** Elements of a set or list for FÜR JEDE and WÄHLE ZUFÄLLIG. */
function elements(v: Value): Value[] {
  if (v && typeof v === 'object') {
    if (v.t === 'list') return v.items;
    if (v.t === 'figs') return v.ids.map((id) => ({ t: 'fig', id }));
    if (v.t === 'tiles') return v.pos.map((pos) => ({ t: 'tile', pos }));
    return [v];
  }
  return [];
}

function asNumber(v: Value): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

function asText(v: Value): string {
  if (typeof v === 'string') return v;
  if (typeof v === 'number') return String(Math.round(v * 100) / 100);
  return '';
}

function valuePos(state: GameState, v: Value): Pos | undefined {
  if (v && typeof v === 'object') {
    if (v.t === 'tile') return v.pos;
    if (v.t === 'fig') return state.figures[v.id]?.pos;
  }
  return undefined;
}

function clampNumber(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(-1_000_000, Math.min(1_000_000, n));
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

/** A property of any value: figure, tile, list or set. */
function propOf(state: GameState, v: Value, prop: string): Value {
  if (v && typeof v === 'object') {
    if (v.t === 'fig') {
      const f = state.figures[v.id];
      return f ? figureProp(state, f, prop) : null;
    }
    if (v.t === 'tile') return tileProp(state, v.pos, prop);
    if (prop === 'length') return elements(v).length;
  }
  return null;
}

function isEdge(state: GameState, pos: Pos): boolean {
  return neighborTiles(state.tiles, pos).length < 4;
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
    case 'tilesOfType': {
      const wanted = asText(args[0] ?? '').toLowerCase();
      return {
        t: 'tiles',
        pos: Object.values(state.tiles)
          .filter((x) => x.type === wanted)
          .map((x) => x.pos),
      };
    }
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
    case 'edgeTiles': {
      const all = tiles();
      step(env, all.length);
      return { t: 'tiles', pos: all.filter((p) => isEdge(state, p)) };
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
    case 'count':
      return elements(args[0] ?? null).length;
    default:
      return null;
  }
}

function arith(op: string, l: Value, r: Value): Value {
  if (op === '+' && (typeof l === 'string' || typeof r === 'string')) {
    return (asText(l) + asText(r)).slice(0, CODE_LIMITS.maxText);
  }
  const a = asNumber(l);
  const b = asNumber(r);
  switch (op) {
    case '+':
      return clampNumber(a + b);
    case '-':
      return clampNumber(a - b);
    case '*':
      return clampNumber(a * b);
    case '/':
      return b === 0 ? 0 : clampNumber(a / b);
    default:
      return 0;
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
      return e.value;
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
    case 'varProp':
      return propOf(state, env.locals.get(e.name.toLowerCase()) ?? null, e.prop);
    case 'prop':
      return propOf(state, evaluate(env, e.of), e.prop);
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
    case 'arith':
      return arith(e.op, evaluate(env, e.left), evaluate(env, e.right));
    case 'list': {
      checkList(e.items.length);
      return { t: 'list', items: e.items.map((i) => evaluate(env, i)) };
    }
    case 'fcall':
      return callFunction(
        env,
        e.name,
        e.args.map((a) => evaluate(env, a)),
      );
    case 'self':
      return ctx.self && state.figures[ctx.self]?.alive ? { t: 'fig', id: ctx.self } : null;
  }
}

function sameValue(a: Value, b: Value): boolean {
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    if (a.t === 'fig' && b.t === 'fig') return a.id === b.id;
    if (a.t === 'tile' && b.t === 'tile') return samePos(a.pos, b.pos);
    return false;
  }
  if (typeof a === 'string' && typeof b === 'string') return a.toLowerCase() === b.toLowerCase();
  return a === b;
}

// ---------- targets ----------

function anchorFigure(ctx: RuleContext): FigureId | undefined {
  return ctx.trigger ?? ctx.attacker ?? ctx.self;
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
    case 'value': {
      // A figure stands for its tile (TELEPORT selbst NEBEN ziel).
      const v = evaluate(env, t.expr);
      const figs = figureIds(v)
        .map((id) => state.figures[id])
        .filter((f): f is Figure => !!f && f.alive)
        .map((f) => ({ ...f.pos }));
      return [...tilePositions(v), ...figs].filter((p) => state.tiles[tileKey(p)]);
    }
  }
}

// ---------- effects ----------

/** Executes one effect (rule DANN line or effect step) through the primitives. */
export function execEffect(env: Env, e: Effect): void {
  if (env.pure) return;
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
      if (type) eachTile(e.at, (pos) => P.spawnNpc(bus, type, pos, env.source.id));
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
    case 'teleport': {
      if (!e.near) return each(e.target, (id) => P.teleportRandom(bus, id));
      const near = resolveTiles(env, e.near)[0];
      if (!near) return;
      return each(e.target, (id) => P.teleportNear(bus, id, near));
    }
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
      P.showMessage(bus, env.source.id, e.text);
      return;
    case 'call':
      return callEffect(
        env,
        e.effect,
        e.args.map((a) => evaluate(env, a)),
      );
    case 'code':
      runStmts(env, [e.stmt]);
      return;
  }
}

function findEffect(state: GameState, name: string): EffectDef | undefined {
  const n = name.toLowerCase();
  return state.effects.find((d) => d.name.toLowerCase() === n);
}

function findFunction(state: GameState, name: string): FunctionDef | undefined {
  const n = name.toLowerCase();
  return (state.functions ?? []).find((d) => d.name.toLowerCase() === n);
}

/** Calls an own effect with evaluated arguments (call depth max. 5). */
export function callEffect(env: Env, name: string, args: Value[]): void {
  const def = findEffect(env.bus.state, name);
  if (!def) return;
  if (env.depth >= EFFECT_LIMITS.maxCallDepth) throw new EffectAbort('depth');
  const locals = new Map<string, Value>();
  def.params.forEach((p, i) => locals.set(p.name.toLowerCase(), args[i] ?? null));
  const inner: Env = { ...env, locals, depth: env.depth + 1 };
  try {
    runStmts(inner, def.body);
  } catch (e) {
    // GIB ZURÜCK inside an effect simply ends the effect.
    if (!(e instanceof Return)) throw e;
  }
}

/** Calls an own function (recursion max. 20). Functions never change the world. */
export function callFunction(env: Env, name: string, args: Value[]): Value {
  const def = findFunction(env.bus.state, name);
  if (!def) return null;
  if (env.fdepth >= CODE_LIMITS.maxRecursion) throw new EffectAbort('depth');
  const locals = new Map<string, Value>();
  def.params.forEach((p, i) => locals.set(p.toLowerCase(), args[i] ?? null));
  const inner: Env = { ...env, locals, ctx: {}, fdepth: env.fdepth + 1, pure: true };
  try {
    runStmts(inner, def.body);
  } catch (e) {
    if (e instanceof Return) return e.value;
    throw e;
  }
  return null;
}

/** Runs statements; used for effect bodies, NPC behavior and NACH blocks. */
export function runStmts(env: Env, stmts: Stmt[]): void {
  for (const s of stmts) {
    if (env.bus.state.status !== 'playing') return;
    runStmt(env, s);
  }
}

function record(env: Env, s: Stmt): void {
  const trace = env.trace;
  if (!trace || trace.length >= CODE_LIMITS.maxTrace) return;
  trace.push({
    line: s.line ?? 0,
    kind: s.kind,
    steps: env.budget.steps,
    depth: env.depth + env.fdepth,
    locals: structuredClone(Object.fromEntries(env.locals)),
  });
}

function runStmt(env: Env, s: Stmt): void {
  step(env);
  record(env, s);
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
    case 'while':
      // The step budget ends endless loops.
      while (truthy(evaluate(env, s.cond))) {
        if (bus.state.status !== 'playing') return;
        step(env);
        runStmts(env, s.body);
      }
      return;
    case 'forEach': {
      const items = elements(evaluate(env, s.in));
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
      const items = elements(evaluate(env, s.from));
      env.locals.set(s.var.toLowerCase(), randomPick(bus.state, items) ?? null);
      return;
    }
    case 'let':
      env.locals.set(s.name.toLowerCase(), evaluate(env, s.value));
      return;
    case 'listAdd': {
      const key = s.list.toLowerCase();
      const list = env.locals.get(key);
      const value = evaluate(env, s.value);
      const items = list && typeof list === 'object' && list.t === 'list' ? list.items : [];
      checkList(items.length + 1);
      env.locals.set(key, { t: 'list', items: [...items, value] });
      return;
    }
    case 'return':
      throw new Return(evaluate(env, s.value));
    case 'play': {
      const sound = asText(evaluate(env, s.sound));
      if (sound && !env.pure) emit(bus, { type: 'soundPlayed', rule: env.source.id, sound });
      return;
    }
    case 'texture': {
      if (env.pure) return;
      const name = asText(evaluate(env, s.name));
      const tile = evaluate(env, s.tile);
      for (const pos of tilePositions(tile)) P.setTextureByName(bus, pos, name);
      return;
    }
    case 'wait':
      if (env.pure) return;
      emit(bus, {
        type: 'waited',
        rule: env.source.id,
        seconds: Math.min(EFFECT_LIMITS.maxWait, Math.max(0, s.seconds)),
      });
      return;
    case 'say': {
      const text = asText(evaluate(env, s.text)).trim();
      if (text && !env.pure) P.showMessage(bus, env.source.id, text);
      return;
    }
    case 'send': {
      if (env.pure) return;
      const name = s.event.toLowerCase().slice(0, CODE_LIMITS.maxEventName);
      emit(bus, { type: 'customEvent', rule: env.source.id, name });
      return;
    }
    case 'after': {
      if (env.pure) return;
      const state = bus.state;
      state.delayed ??= [];
      if (state.delayed.length >= CODE_LIMITS.maxDelayed) return;
      const rounds = Math.min(
        CODE_LIMITS.delayRounds.max,
        Math.max(CODE_LIMITS.delayRounds.min, Math.round(s.rounds)),
      );
      state.delayed.push({
        id: `d${state.nextId++}`,
        rule: env.source.id,
        name: env.source.name,
        dueRound: state.round + rounds,
        body: structuredClone(s.body),
        locals: structuredClone(Object.fromEntries(env.locals)),
        ctx: structuredClone(env.ctx),
      });
      return;
    }
  }
}
