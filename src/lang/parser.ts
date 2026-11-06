// Recursive-descent parser for the rule language (SPEC 5.3) → RuleAST.
// Errors carry line, column and – where possible – a suggestion ("Meintest du …?").
import type { TileType } from '../engine/types';
import type {
  CmpOp,
  Effect,
  Expr,
  FigureRef,
  RuleAST,
  RuleLimit,
  Target,
  TileRef,
  TileTarget,
  Trigger,
  VarScope,
} from './ast';
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
  fold,
  lookup,
  spellings,
} from './keywords';
import { tokenize, type Token } from './lexer';
import { suggest } from './suggest';

export interface ParseError {
  /** i18n key suffix: parse.<code> */
  code: string;
  line: number;
  col: number;
  params?: Record<string, string | number>;
  suggestion?: string;
}

/** Source line of every part of a rule, so validator errors can name the line. */
export interface RuleLines {
  name: number;
  trigger: number;
  conditions: number[];
  effects: number[];
  elseEffects: number[];
  duration: number | null;
  limit: number | null;
}

export interface ParsedRule {
  ast: RuleAST;
  lines: RuleLines;
}

class LineError extends Error {
  constructor(readonly error: ParseError) {
    super(error.code);
  }
}

const FIGURE_REFS: Record<string, FigureRef> = {
  trigger: 'trigger',
  attacker: 'attacker',
  target: 'target',
};

const ALL_VALUE_WORDS = [
  ...spellings(TARGET_W, 'de').slice(0, 3),
  ...spellings(TILE_W, 'de').slice(0, 2),
  ...spellings(VALUE_W, 'de'),
  ...spellings(TILE_TYPE_W, 'de'),
];

/** Cursor over the tokens of one line. */
class Line {
  private i = 0;
  constructor(
    private readonly tokens: Token[],
    readonly lineNo: number,
  ) {}

  peek(offset = 0): Token | undefined {
    return this.tokens[this.i + offset];
  }

  done(): boolean {
    return this.i >= this.tokens.length;
  }

  next(): Token | undefined {
    return this.tokens[this.i++];
  }

  fail(
    code: string,
    token?: Token,
    params?: ParseError['params'],
    suggestion?: string | null,
  ): never {
    const t = token ?? this.peek() ?? this.tokens[this.tokens.length - 1];
    const col = token ? token.col : t ? t.col + (this.done() ? t.text.length + 1 : 0) : 1;
    const error: ParseError = { code, line: this.lineNo, col };
    if (params) error.params = params;
    if (suggestion) error.suggestion = suggestion;
    throw new LineError(error);
  }

  /** Expects a word from `table`; returns its key. */
  expectWord<K extends string>(table: Record<K, { de: string; en: string }>, code: string): K {
    const t = this.next();
    if (!t || t.kind !== 'word') this.fail(code, t, { found: t?.text ?? '' });
    const key = lookup(table, t.text);
    if (key === null) {
      this.fail(code, t, { found: t.text }, suggest(t.text, spellings(table, 'de')));
    }
    return key;
  }

  isWord(w: { de: string; en: string }, offset = 0): boolean {
    const t = this.peek(offset);
    return !!t && t.kind === 'word' && (fold(t.text) === fold(w.de) || fold(t.text) === fold(w.en));
  }

  expectKw(w: { de: string; en: string }): void {
    const t = this.next();
    if (!t || t.kind !== 'word' || (fold(t.text) !== fold(w.de) && fold(t.text) !== fold(w.en))) {
      this.fail('expected', t, { expected: w.de, found: t?.text ?? '' });
    }
  }

  isSymbol(s: string, offset = 0): boolean {
    const t = this.peek(offset);
    return !!t && t.kind === 'symbol' && t.text === s;
  }

  expectSymbol(s: string): void {
    const t = this.next();
    if (!t || t.kind !== 'symbol' || t.text !== s) {
      this.fail('expected', t, { expected: s, found: t?.text ?? '' });
    }
  }

  number(): number {
    const t = this.next();
    if (!t || t.kind !== 'number') this.fail('expectedNumber', t, { found: t?.text ?? '' });
    return Number(t.text);
  }

  signedNumber(): number {
    if (this.isSymbol('+')) {
      this.next();
      return this.number();
    }
    if (this.isSymbol('-')) {
      this.next();
      return -this.number();
    }
    return this.number();
  }

  string(): string {
    const t = this.next();
    if (!t || t.kind !== 'string') this.fail('expectedString', t, { found: t?.text ?? '' });
    return t.text;
  }

  end(): void {
    const t = this.peek();
    if (t) this.fail('trailing', t, { found: t.text });
  }
}

// ---------- values and expressions ----------

function tileProp(line: Line): 'type' | 'figureCount' | 'texture' {
  return line.expectWord(TILE_PROP_W, 'unknownProperty');
}

function value(line: Line): Expr {
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

function orExpr(line: Line): Expr {
  const items = [andExpr(line)];
  while (line.isWord(KW.or)) {
    line.next();
    items.push(andExpr(line));
  }
  return items.length === 1 ? items[0]! : { kind: 'or', items };
}

// ---------- targets ----------

function figureRefOf(word: string): FigureRef | null {
  const t = lookup(TARGET_W, word);
  return t && FIGURE_REFS[t] ? (FIGURE_REFS[t] as FigureRef) : null;
}

function target(line: Line): Target {
  const key = line.expectWord(TARGET_W, 'unknownTarget');
  const ref = FIGURE_REFS[key];
  return ref ? { kind: 'ref', ref: ref as FigureRef } : ({ kind: key } as Target);
}

function tileType(line: Line): TileType {
  return line.expectWord(TILE_TYPE_W, 'unknownTileType');
}

function tileTarget(line: Line): TileTarget {
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

function roundsWord(line: Line): void {
  if (line.isWord(KW.round) || line.isWord(KW.rounds)) line.next();
  else
    line.fail('expected', line.peek(), { expected: KW.rounds.de, found: line.peek()?.text ?? '' });
}

// ---------- actions ----------

function action(line: Line): Effect {
  const kind = line.expectWord(ACTION_KW, 'unknownAction');
  switch (kind) {
    case 'spawn': {
      const npc = line.next();
      if (!npc || npc.kind !== 'word') return line.fail('expectedName', npc);
      line.expectKw(KW.at);
      return { kind: 'spawn', npcType: npc.text.toLowerCase(), at: tileTarget(line) };
    }
    case 'damage':
    case 'heal':
    case 'shield': {
      const t = target(line);
      return { kind, target: t, amount: line.number() };
    }
    case 'skip': {
      const t = target(line);
      return { kind: 'skip', target: t, turns: line.number() };
    }
    case 'moveMod': {
      const t = target(line);
      const delta = line.signedNumber();
      line.expectKw(KW.for);
      const rounds = line.number();
      roundsWord(line);
      return { kind: 'moveMod', target: t, delta, rounds };
    }
    case 'wheelMod': {
      const t = target(line);
      const delta = line.signedNumber();
      line.expectSymbol('%');
      line.expectKw(KW.for);
      const rounds = line.number();
      roundsWord(line);
      return { kind: 'wheelMod', target: t, delta, rounds };
    }
    case 'teleport': {
      const t = target(line);
      line.expectKw(KW.randomly);
      return { kind: 'teleport', target: t };
    }
    case 'push': {
      const t = target(line);
      line.expectKw(KW.awayFrom);
      const from = tileTarget(line);
      return { kind: 'push', target: t, from, distance: line.number() };
    }
    case 'setTileType': {
      const at = tileTarget(line);
      line.expectKw(KW.to);
      return { kind: 'setTileType', at, tileType: tileType(line) };
    }
    case 'removeTile':
      return { kind: 'removeTile', at: tileTarget(line) };
    case 'addTileNear':
      line.expectKw(KW.nextTo);
      return { kind: 'addTileNear', at: tileTarget(line) };
    case 'setVar': {
      const first = line.peek();
      let scope: VarScope;
      if (first?.kind === 'word' && lookup(VALUE_W, first.text) === 'world') {
        line.next();
        scope = { kind: 'world' };
      } else {
        scope = { kind: 'figures', target: target(line) };
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
        value: value(line),
      };
    }
    case 'message':
      return { kind: 'message', text: line.string() };
  }
}

// ---------- events ----------

function trigger(line: Line): Trigger {
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

// ---------- rules ----------

type LineKind = 'rule' | 'when' | 'and' | 'then' | 'else' | 'duration' | 'limit';
const LINE_STARTS: Record<LineKind, { de: string; en: string }> = {
  rule: KW.rule,
  when: KW.when,
  and: KW.and,
  then: KW.then,
  else: KW.else,
  duration: KW.duration,
  limit: KW.limit,
};

interface Draft {
  name: string;
  trigger: Trigger | null;
  conditions: Expr[];
  effects: Effect[];
  elseEffects: Effect[];
  duration: number | null;
  limit: RuleLimit | null;
  lines: RuleLines;
  /** A line of this rule had an error: suppress follow-up "missing" errors. */
  failed: boolean;
}

function splitLines(tokens: Token[]): Token[][] {
  const out: Token[][] = [];
  let cur: Token[] = [];
  for (const t of tokens) {
    if (t.kind === 'newline' || t.kind === 'eof') {
      if (cur.length > 0) out.push(cur);
      cur = [];
    } else cur.push(t);
  }
  return out;
}

/** Parses a text with one or more rules. */
export function parseRules(source: string): { rules: ParsedRule[]; errors: ParseError[] } {
  const { tokens, errors: lexErrors } = tokenize(source);
  const errors: ParseError[] = lexErrors.map((e) => ({ ...e }) as ParseError);
  const rules: ParsedRule[] = [];
  let draft: Draft | null = null;

  const finish = () => {
    if (!draft) return;
    const d = draft;
    if (!d.failed && !d.trigger) errors.push({ code: 'missingWhen', line: d.lines.name, col: 1 });
    if (!d.failed && d.effects.length === 0) {
      errors.push({ code: 'missingThen', line: d.lines.name, col: 1 });
    }
    if (d.trigger) {
      rules.push({
        ast: {
          name: d.name,
          trigger: d.trigger,
          conditions: d.conditions,
          effects: d.effects,
          elseEffects: d.elseEffects,
          duration: d.duration,
          limit: d.limit,
        },
        lines: d.lines,
      });
    }
    draft = null;
  };

  for (const toks of splitLines(tokens)) {
    const first = toks[0];
    if (!first) continue;
    // Explicit type so that `never`-returning fail() narrows (TS control flow).
    const line: Line = new Line(toks, first.line);
    try {
      const kind = first.kind === 'word' ? lookup(LINE_STARTS, first.text) : null;
      if (!kind) {
        line.fail(
          'unknownLine',
          first,
          { found: first.text },
          first.kind === 'word'
            ? suggest(
                first.text,
                Object.values(LINE_STARTS).map((w) => w.de),
              )
            : null,
        );
      }
      line.next();
      if (kind === 'rule') {
        finish();
        const name = line.string();
        line.end();
        draft = {
          name,
          trigger: null,
          conditions: [],
          effects: [],
          elseEffects: [],
          duration: null,
          limit: null,
          failed: false,
          lines: {
            name: line.lineNo,
            trigger: line.lineNo,
            conditions: [],
            effects: [],
            elseEffects: [],
            duration: null,
            limit: null,
          },
        };
        continue;
      }
      const d: Draft | null = draft;
      if (!d) line.fail('expectedRule', first);
      switch (kind) {
        case 'when':
          if (d.trigger) line.fail('duplicateWhen', first);
          d.trigger = trigger(line);
          d.lines.trigger = line.lineNo;
          break;
        case 'and':
          if ((!d.trigger && !d.failed) || d.effects.length > 0)
            line.fail('misplacedCondition', first);
          d.conditions.push(orExpr(line));
          d.lines.conditions.push(line.lineNo);
          break;
        case 'then':
          if (!d.trigger && !d.failed) line.fail('missingWhen', first);
          if (d.elseEffects.length > 0) line.fail('thenAfterElse', first);
          d.effects.push(action(line));
          d.lines.effects.push(line.lineNo);
          break;
        case 'else':
          if (d.effects.length === 0 && !d.failed) line.fail('missingThen', first);
          d.elseEffects.push(action(line));
          d.lines.elseEffects.push(line.lineNo);
          break;
        case 'duration':
          d.duration = line.number();
          roundsWord(line);
          d.lines.duration = line.lineNo;
          break;
        case 'limit': {
          const count = line.number();
          line.expectKw(KW.per);
          const per = line.isWord(KW.round)
            ? 'round'
            : line.isWord(KW.turn)
              ? 'turn'
              : line.isWord(KW.game)
                ? 'game'
                : null;
          if (!per) {
            line.fail('expected', line.peek(), {
              expected: 'RUNDE / ZUG / SPIEL',
              found: line.peek()?.text ?? '',
            });
          }
          line.next();
          d.limit = { count, per };
          d.lines.limit = line.lineNo;
          break;
        }
      }
      line.end();
    } catch (e) {
      if (!(e instanceof LineError)) throw e;
      errors.push(e.error);
      if (draft) (draft as Draft).failed = true;
    }
  }
  finish();
  if (rules.length === 0 && errors.length === 0) {
    errors.push({ code: 'expectedRule', line: 1, col: 1 });
  }
  errors.sort((a, b) => a.line - b.line || a.col - b.col);
  return { rules, errors };
}

/** Parses exactly one rule (the editor's text view). */
export function parseRule(source: string): { rule: ParsedRule | null; errors: ParseError[] } {
  const { rules, errors } = parseRules(source);
  if (rules.length > 1) {
    errors.push({ code: 'oneRuleOnly', line: rules[1]?.lines.name ?? 1, col: 1 });
  }
  return { rule: errors.length === 0 ? (rules[0] ?? null) : null, errors };
}

export type { TileRef };
