// Line-level syntax of the rule language (SPEC 5.3): values, conditions, targets,
// actions and triggers. The code parser (codeSyntax.ts) reuses the actions with its own
// value parsers, so that `ENTFERNE f` works with local variables.
import type { TileType } from '../engine/types';
import type { CmpOp, Effect, Expr, FigureRef, Target, TileTarget, Trigger, VarScope } from './ast';
import {
  ACTION_KW,
  EVENT_KW,
  FIGURE_PROP_W,
  KW,
  TARGET_W,
  TILE_PROP_W,
  TILE_TYPE_W,
  TILE_W,
  VALUE_W,
  lookup,
  spellings,
} from './keywords';
import type { Line } from './line';
import { suggest } from './suggest';

export const FIGURE_REFS: Record<string, FigureRef> = {
  trigger: 'trigger',
  attacker: 'attacker',
  target: 'target',
};

export const ALL_VALUE_WORDS = [
  ...spellings(TARGET_W, 'de').slice(0, 3),
  ...spellings(TILE_W, 'de').slice(0, 2),
  ...spellings(VALUE_W, 'de'),
  ...spellings(TILE_TYPE_W, 'de'),
];

/** How an action reads its figure targets, tile targets and values. */
export interface ValueParsers {
  target(line: Line): Target;
  tileTarget(line: Line): TileTarget;
  value(line: Line): Expr;
  /** Argument of an own effect call. */
  arg(line: Line): Expr;
}

// ---------- values and expressions ----------

function tileProp(line: Line): 'type' | 'figureCount' | 'texture' {
  return line.expectWord(TILE_PROP_W, 'unknownProperty');
}

export function value(line: Line): Expr {
  const t = line.peek();
  if (!t) return line.fail('expectedValue');
  if (t.kind === 'number' || line.isSymbol('-')) return { kind: 'num', value: line.signedNumber() };
  if (t.kind === 'string') return { kind: 'str', value: line.string() };
  if (t.kind !== 'word') return line.fail('expectedValue', t, { found: t.text });
  line.next();
  const target = lookup(TARGET_W, t.text);
  if (target && FIGURE_REFS[target]) {
    const ref = FIGURE_REFS[target] as FigureRef;
    line.expectSymbol('.');
    const propTok = line.peek();
    const prop = propTok?.kind === 'word' ? lookup(FIGURE_PROP_W, propTok.text) : null;
    if (prop === 'tile') {
      line.next();
      line.expectSymbol('.');
      return { kind: 'tileProp', tile: { kind: 'figureTile', ref }, prop: tileProp(line) };
    }
    if (prop) {
      line.next();
      return { kind: 'figureProp', ref, prop };
    }
    const name = line.next();
    if (!name || name.kind !== 'word') return line.fail('expectedName', name);
    return { kind: 'figureVar', ref, name: name.text.toLowerCase() };
  }
  const tile = lookup(TILE_W, t.text);
  if (tile === 'eventTile' || tile === 'fromTile') {
    line.expectSymbol('.');
    return { kind: 'tileProp', tile: { kind: tile }, prop: tileProp(line) };
  }
  const v = lookup(VALUE_W, t.text);
  if (v === 'world') {
    line.expectSymbol('.');
    const name = line.next();
    if (!name || name.kind !== 'word') return line.fail('expectedName', name);
    return { kind: 'worldVar', name: name.text.toLowerCase() };
  }
  if (v === 'round' || v === 'tileCount' || v === 'npcCount') return { kind: 'global', name: v };
  if (v === 'amount') return { kind: 'amount' };
  const tileType = lookup(TILE_TYPE_W, t.text);
  if (tileType) return { kind: 'str', value: tileType };
  return line.fail('unknownValue', t, { found: t.text }, suggest(t.text, ALL_VALUE_WORDS));
}

const CMP_OPS = new Set<CmpOp>(['=', '!=', '<', '>', '<=', '>=']);

function primary(line: Line): Expr {
  if (line.isSymbol('(')) {
    line.next();
    const inner = orExpr(line);
    line.expectSymbol(')');
    return inner;
  }
  if (line.isWord(KW.chance)) {
    line.next();
    const percent = line.number();
    line.expectSymbol('%');
    return { kind: 'chance', percent };
  }
  const left = value(line);
  const op = line.next();
  if (!op || op.kind !== 'symbol' || !CMP_OPS.has(op.text as CmpOp)) {
    return line.fail('expectedComparison', op, { found: op?.text ?? '' });
  }
  const right = value(line);
  return { kind: 'cmp', op: op.text as CmpOp, left, right };
}

function notExpr(line: Line): Expr {
  if (line.isWord(KW.not)) {
    line.next();
    return { kind: 'not', item: notExpr(line) };
  }
  return primary(line);
}

function andExpr(line: Line): Expr {
  const items = [notExpr(line)];
  while (line.isWord(KW.and)) {
    line.next();
    items.push(notExpr(line));
  }
  return items.length === 1 ? items[0]! : { kind: 'and', items };
}

export function orExpr(line: Line): Expr {
  const items = [andExpr(line)];
  while (line.isWord(KW.or)) {
    line.next();
    items.push(andExpr(line));
  }
  return items.length === 1 ? items[0]! : { kind: 'or', items };
}

// ---------- targets ----------

export function figureRefOf(word: string): FigureRef | null {
  const t = lookup(TARGET_W, word);
  return t && FIGURE_REFS[t] ? (FIGURE_REFS[t] as FigureRef) : null;
}

export function target(line: Line): Target {
  const key = line.expectWord(TARGET_W, 'unknownTarget');
  const ref = FIGURE_REFS[key];
  return ref ? { kind: 'ref', ref: ref as FigureRef } : ({ kind: key } as Target);
}

export function tileType(line: Line): TileType {
  return line.expectWord(TILE_TYPE_W, 'unknownTileType');
}

export function tileTarget(line: Line): TileTarget {
  const t = line.peek();
  if (t?.kind === 'word') {
    const ref = figureRefOf(t.text);
    if (ref) {
      line.next();
      line.expectSymbol('.');
      line.expectKw(FIGURE_PROP_W.tile);
      return { kind: 'figureTile', ref };
    }
  }
  const key = line.expectWord(TILE_W, 'unknownTileTarget');
  if (key === 'newTile') return line.fail('unknownTileTarget', t, { found: t?.text ?? '' });
  if (key === 'tilesOfType') return { kind: 'tilesOfType', tileType: tileType(line) };
  return { kind: key } as TileTarget;
}

export function roundsWord(line: Line): void {
  if (line.isWord(KW.round) || line.isWord(KW.rounds)) line.next();
  else
    line.fail('expected', line.peek(), { expected: KW.rounds.de, found: line.peek()?.text ?? '' });
}

// ---------- actions ----------

/** Argument of an effect call in a rule: values, figures, tiles or sets (SPEC 5.7). */
function callArg(line: Line): Expr {
  const t = line.peek();
  if (t?.kind === 'word') {
    const followedByDot = line.isSymbol('.', 1);
    const target = lookup(TARGET_W, t.text);
    if (target) {
      const ref = FIGURE_REFS[target];
      if (ref && !followedByDot) {
        line.next();
        return { kind: 'figureRef', ref: ref as FigureRef };
      }
      // ziel.feld (the tile of a figure) unless a tile property follows (ziel.feld.typ)
      const third = line.peek(2);
      if (
        ref &&
        third?.kind === 'word' &&
        lookup(FIGURE_PROP_W, third.text) === 'tile' &&
        !line.isSymbol('.', 3)
      ) {
        line.next();
        line.next();
        line.next();
        return { kind: 'tileRef', tile: { kind: 'figureTile', ref: ref as FigureRef } };
      }
      if (!ref) {
        line.next();
        return { kind: 'targets', target: { kind: target } as Target };
      }
    }
    const tile = lookup(TILE_W, t.text);
    if ((tile === 'eventTile' || tile === 'fromTile') && !followedByDot) {
      line.next();
      return { kind: 'tileRef', tile: { kind: tile } };
    }
    if (tile && tile !== 'eventTile' && tile !== 'fromTile' && tile !== 'newTile') {
      return { kind: 'tiles', target: tileTarget(line) };
    }
  }
  return value(line);
}

export const EFFECT_NAME = /^[A-Za-zÄÖÜäöüß_][A-Za-zÄÖÜäöüß_0-9]*$/;

export const RULE_PARSERS: ValueParsers = { target, tileTarget, value, arg: callArg };

export function action(line: Line, P: ValueParsers = RULE_PARSERS): Effect {
  // Own effect: Name(arg, …)
  const first = line.peek();
  if (first?.kind === 'word' && line.isSymbol('(', 1) && EFFECT_NAME.test(first.text)) {
    line.next();
    line.next();
    const args: Expr[] = [];
    if (!line.isSymbol(')')) {
      args.push(P.arg(line));
      while (line.isSymbol(',')) {
        line.next();
        args.push(P.arg(line));
      }
    }
    line.expectSymbol(')');
    return { kind: 'call', effect: first.text, args };
  }
  const kind = line.expectWord(ACTION_KW, 'unknownAction');
  switch (kind) {
    case 'spawn': {
      const npc = line.next();
      if (!npc || npc.kind !== 'word') return line.fail('expectedName', npc);
      line.expectKw(KW.at);
      return { kind: 'spawn', npcType: npc.text.toLowerCase(), at: P.tileTarget(line) };
    }
    case 'damage':
    case 'heal':
    case 'shield': {
      const t = P.target(line);
      return { kind, target: t, amount: line.number() };
    }
    case 'skip': {
      const t = P.target(line);
      return { kind: 'skip', target: t, turns: line.number() };
    }
    case 'moveMod': {
      const t = P.target(line);
      const delta = line.signedNumber();
      line.expectKw(KW.for);
      const rounds = line.number();
      roundsWord(line);
      return { kind: 'moveMod', target: t, delta, rounds };
    }
    case 'wheelMod': {
      const t = P.target(line);
      const delta = line.signedNumber();
      line.expectSymbol('%');
      line.expectKw(KW.for);
      const rounds = line.number();
      roundsWord(line);
      return { kind: 'wheelMod', target: t, delta, rounds };
    }
    case 'teleport': {
      const t = P.target(line);
      if (line.isWord(KW.nextTo)) {
        line.next();
        return { kind: 'teleport', target: t, near: P.tileTarget(line) };
      }
      line.expectKw(KW.randomly);
      return { kind: 'teleport', target: t };
    }
    case 'push': {
      const t = P.target(line);
      line.expectKw(KW.awayFrom);
      const from = P.tileTarget(line);
      return { kind: 'push', target: t, from, distance: line.number() };
    }
    case 'setTileType': {
      const at = P.tileTarget(line);
      line.expectKw(KW.to);
      return { kind: 'setTileType', at, tileType: tileType(line) };
    }
    case 'removeTile':
      return { kind: 'removeTile', at: P.tileTarget(line) };
    case 'addTileNear':
      line.expectKw(KW.nextTo);
      return { kind: 'addTileNear', at: P.tileTarget(line) };
    case 'setVar': {
      const first = line.peek();
      let scope: VarScope;
      if (first?.kind === 'word' && lookup(VALUE_W, first.text) === 'world') {
        line.next();
        scope = { kind: 'world' };
      } else {
        scope = { kind: 'figures', target: P.target(line) };
      }
      line.expectSymbol('.');
      const name = line.next();
      if (!name || name.kind !== 'word') return line.fail('expectedName', name);
      const op = line.next();
      if (!op || op.kind !== 'symbol' || !['=', '+', '-'].includes(op.text)) {
        return line.fail('expected', op, { expected: '= + -', found: op?.text ?? '' });
      }
      return {
        kind: 'setVar',
        scope,
        name: name.text.toLowerCase(),
        op: op.text as '=' | '+' | '-',
        value: P.value(line),
      };
    }
    case 'message':
      return { kind: 'message', text: line.string() };
  }
}

// ---------- events ----------

export function trigger(line: Line): Trigger {
  if (line.isWord(KW.event)) {
    line.next();
    return { kind: 'custom', event: line.string().toLowerCase() };
  }
  if (line.isWord(KW.every)) {
    line.next();
    const n = line.number();
    roundsWord(line);
    return { kind: 'everyNRounds', n };
  }
  const kind = line.expectWord(EVENT_KW, 'unknownEvent');
  if (kind === 'enters') {
    const t = line.next();
    const w = t?.kind === 'word' ? lookup(TILE_W, t.text) : null;
    if (w === 'eventTile') return { kind: 'enters', newOnly: false };
    if (w === 'newTile') return { kind: 'enters', newOnly: true };
    return line.fail('expected', t, { expected: 'feld / neues_feld', found: t?.text ?? '' });
  }
  if (kind === 'leaves') {
    const t = line.next();
    if (!t || t.kind !== 'word' || lookup(TILE_W, t.text) !== 'eventTile') {
      return line.fail('expected', t, { expected: 'feld', found: t?.text ?? '' });
    }
    return { kind: 'leaves' };
  }
  return { kind } as Trigger;
}
