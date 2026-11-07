// Line-level syntax of effect bodies and Profi-Code (SPEC 5.7, 5.8): expressions with
// local variables, arithmetic, lists and calls, and one statement per line. Block
// structure (… ENDE) is handled by parser.ts. Local variables shadow the words of the
// rule language, so `MERKE ziel = …` or a parameter `menge` work as expected.
import type { CmpOp, Effect, Expr, Stmt, Target, TileTarget } from './ast';
import {
  ACTION_KW,
  FIGURE_PROP_W,
  KW,
  LIST_W,
  NONE_W,
  QUERY_W,
  SELF_W,
  STMT_KW,
  TARGET_W,
  TILE_PROP_W,
  TILE_TYPE_W,
  TILE_W,
  VALUE_W,
  fold,
  lookup,
  spellings,
} from './keywords';
import type { Line } from './line';
import {
  ALL_VALUE_WORDS,
  EFFECT_NAME,
  FIGURE_REFS,
  action,
  roundsWord,
  tileTarget as ruleTileTarget,
  target as ruleTarget,
  value as ruleValue,
  type ValueParsers,
} from './ruleSyntax';
import { suggest } from './suggest';

/** Names visible while parsing one definition or rule. */
export interface CodeScope {
  /** Folded names of parameters and local variables. */
  locals: Set<string>;
  /** Inside NPC "…" ZUG: `selbst` is available. */
  self: boolean;
}

export function newScope(names: readonly string[] = [], self = false): CodeScope {
  return { locals: new Set(names.map(fold)), self };
}

/** Queries that are written without parentheses (alle_figuren, leere_felder …). */
const BARE_QUERIES = new Set(['emptyTiles', 'allFigures', 'allNpcs', 'edgeTiles']);

const CMP_OPS = new Set<CmpOp>(['=', '!=', '<', '>', '<=', '>=']);

function isLocal(scope: CodeScope, word: string): boolean {
  return scope.locals.has(fold(word));
}

function isSelf(scope: CodeScope, word: string): boolean {
  const f = fold(word);
  return scope.self && (f === fold(SELF_W.de) || f === fold(SELF_W.en));
}

function propName(word: string): string {
  const fp = lookup(FIGURE_PROP_W, word);
  if (fp) return fp;
  const tp = lookup(TILE_PROP_W, word);
  if (tp) return tp;
  if (lookup(LIST_W, word) === 'length') return 'length';
  return word.toLowerCase();
}

function args(line: Line, scope: CodeScope): Expr[] {
  line.expectSymbol('(');
  const out: Expr[] = [];
  if (!line.isSymbol(')')) {
    out.push(expr(line, scope));
    while (line.isSymbol(',')) {
      line.next();
      out.push(expr(line, scope));
    }
  }
  line.expectSymbol(')');
  return out;
}

function suggestions(scope: CodeScope): string[] {
  return [
    ...scope.locals,
    ...ALL_VALUE_WORDS,
    ...spellings(QUERY_W, 'de'),
    ...spellings(TARGET_W, 'de'),
    ...(scope.self ? [SELF_W.de] : []),
  ];
}

function primary(line: Line, scope: CodeScope): Expr {
  const t = line.peek();
  if (!t) return line.fail('expectedValue');
  if (t.kind === 'number') return { kind: 'num', value: line.decimal() };
  if (t.kind === 'string') return { kind: 'str', value: line.string() };
  if (line.isSymbol('(')) {
    line.next();
    const inner = expr(line, scope);
    line.expectSymbol(')');
    return inner;
  }
  if (line.isSymbol('[')) {
    line.next();
    const items: Expr[] = [];
    if (!line.isSymbol(']')) {
      items.push(expr(line, scope));
      while (line.isSymbol(',')) {
        line.next();
        items.push(expr(line, scope));
      }
    }
    line.expectSymbol(']');
    return { kind: 'list', items };
  }
  if (t.kind !== 'word') return line.fail('expectedValue', t, { found: t.text });
  if (line.isWord(KW.chance)) {
    line.next();
    const percent = line.number();
    line.expectSymbol('%');
    return { kind: 'chance', percent };
  }
  if (line.isWord(NONE_W)) {
    line.next();
    return { kind: 'none' };
  }
  if (isLocal(scope, t.text)) {
    line.next();
    return { kind: 'var', name: t.text };
  }
  if (isSelf(scope, t.text)) {
    line.next();
    return { kind: 'self' };
  }
  const followedByDot = line.isSymbol('.', 1);
  if (line.isSymbol('(', 1)) {
    const q = lookup(QUERY_W, t.text);
    line.next();
    if (q) return { kind: 'query', name: q, args: args(line, scope) };
    if (!EFFECT_NAME.test(t.text)) return line.fail('expectedName', t);
    return { kind: 'fcall', name: t.text, args: args(line, scope) };
  }
  const q = lookup(QUERY_W, t.text);
  if (q && BARE_QUERIES.has(q)) {
    line.next();
    return { kind: 'query', name: q, args: [] };
  }
  // Words of the rule language: auslöser.leben, feld.typ, welt.flut, runde, menge …
  const target = lookup(TARGET_W, t.text);
  if (target) {
    const ref = FIGURE_REFS[target];
    const third = line.peek(2);
    if (
      ref &&
      followedByDot &&
      third?.kind === 'word' &&
      lookup(FIGURE_PROP_W, third.text) === 'tile' &&
      !line.isSymbol('.', 3)
    ) {
      // ziel.feld: the tile of an event figure
      line.next();
      line.next();
      line.next();
      return { kind: 'tileRef', tile: { kind: 'figureTile', ref } };
    }
    if (ref && followedByDot) return ruleValue(line);
    line.next();
    if (ref) return { kind: 'figureRef', ref };
    return { kind: 'targets', target: { kind: target } as Target };
  }
  const tile = lookup(TILE_W, t.text);
  if (tile === 'eventTile' || tile === 'fromTile') {
    if (followedByDot) return ruleValue(line);
    line.next();
    return { kind: 'tileRef', tile: { kind: tile } };
  }
  if (tile && tile !== 'newTile') return { kind: 'tiles', target: ruleTileTarget(line) };
  if (lookup(VALUE_W, t.text)) return ruleValue(line);
  const tileType = lookup(TILE_TYPE_W, t.text);
  if (tileType) {
    line.next();
    return { kind: 'str', value: tileType };
  }
  return line.fail('unknownValue', t, { found: t.text }, suggest(t.text, suggestions(scope)));
}

function postfix(line: Line, scope: CodeScope): Expr {
  let e = primary(line, scope);
  while (line.isSymbol('.') && line.peek(1)?.kind === 'word') {
    // liste.füge_hinzu(x) is a statement, not a value.
    if (line.isSymbol('(', 2)) return e;
    line.next();
    const prop = propName(line.next()?.text ?? '');
    e = e.kind === 'var' ? { kind: 'varProp', name: e.name, prop } : { kind: 'prop', of: e, prop };
  }
  return e;
}

function unary(line: Line, scope: CodeScope): Expr {
  if (line.isSymbol('-')) {
    line.next();
    if (line.peek()?.kind === 'number') return { kind: 'num', value: -line.decimal() };
    return { kind: 'arith', op: '-', left: { kind: 'num', value: 0 }, right: unary(line, scope) };
  }
  return postfix(line, scope);
}

function term(line: Line, scope: CodeScope): Expr {
  let e = unary(line, scope);
  while (line.isSymbol('*') || line.isSymbol('/')) {
    const op = line.next()?.text as '*' | '/';
    e = { kind: 'arith', op, left: e, right: unary(line, scope) };
  }
  return e;
}

function sum(line: Line, scope: CodeScope): Expr {
  let e = term(line, scope);
  while (line.isSymbol('+') || line.isSymbol('-')) {
    const op = line.next()?.text as '+' | '-';
    e = { kind: 'arith', op, left: e, right: term(line, scope) };
  }
  return e;
}

function comparison(line: Line, scope: CodeScope): Expr {
  const left = sum(line, scope);
  const op = line.peek();
  if (op?.kind === 'symbol' && CMP_OPS.has(op.text as CmpOp)) {
    line.next();
    return { kind: 'cmp', op: op.text as CmpOp, left, right: sum(line, scope) };
  }
  return left;
}

function notExpr(line: Line, scope: CodeScope): Expr {
  if (line.isWord(KW.not)) {
    line.next();
    return { kind: 'not', item: notExpr(line, scope) };
  }
  return comparison(line, scope);
}

function andExpr(line: Line, scope: CodeScope): Expr {
  const items = [notExpr(line, scope)];
  while (line.isWord(KW.and)) {
    line.next();
    items.push(notExpr(line, scope));
  }
  return items.length === 1 ? items[0]! : { kind: 'and', items };
}

/** A full expression of the code language. */
export function expr(line: Line, scope: CodeScope): Expr {
  const items = [andExpr(line, scope)];
  while (line.isWord(KW.or)) {
    line.next();
    items.push(andExpr(line, scope));
  }
  return items.length === 1 ? items[0]! : { kind: 'or', items };
}

// ---------- targets of actions ----------

/** Does the next word start a code value (local, selbst, query call …) rather than a rule word? */
function startsCodeValue(line: Line, scope: CodeScope): boolean {
  const t = line.peek();
  if (!t) return false;
  if (t.kind !== 'word') return true;
  if (isLocal(scope, t.text)) return true;
  if (isSelf(scope, t.text)) return true;
  if (line.isSymbol('(', 1)) return true;
  const q = lookup(QUERY_W, t.text);
  return !!q && BARE_QUERIES.has(q);
}

export function codeParsers(scope: CodeScope): ValueParsers {
  return {
    target: (line) =>
      startsCodeValue(line, scope)
        ? { kind: 'value', expr: postfix(line, scope) }
        : ruleTarget(line),
    tileTarget: (line): TileTarget => {
      if (startsCodeValue(line, scope)) return { kind: 'value', expr: postfix(line, scope) };
      const t = line.peek();
      // auslöser.feld and the other rule words keep their rule meaning.
      if (t?.kind === 'word' && lookup(TARGET_W, t.text) && !line.isSymbol('.', 1)) {
        return { kind: 'value', expr: postfix(line, scope) };
      }
      return ruleTileTarget(line);
    },
    value: (line) => expr(line, scope),
    arg: (line) => expr(line, scope),
  };
}

// ---------- statements ----------

/** A statement line; `opens` is the list that the following lines fill until ENDE. */
export interface StmtLine {
  stmt: Stmt;
  opens: Stmt[] | null;
}

function declare(scope: CodeScope, name: string): void {
  scope.locals.add(fold(name));
}

function varName(line: Line): string {
  const t = line.next();
  if (!t || t.kind !== 'word') return line.fail('expectedName', t);
  return t.text;
}

/** SETZE x.name op wert: the target is everything before the last property. */
function setVar(line: Line, scope: CodeScope): Effect {
  let scopeOf: Extract<Effect, { kind: 'setVar' }>['scope'];
  let name: string;
  const first = line.peek();
  if (
    first?.kind === 'word' &&
    !isLocal(scope, first.text) &&
    lookup(VALUE_W, first.text) === 'world'
  ) {
    line.next();
    line.expectSymbol('.');
    name = varName(line).toLowerCase();
    scopeOf = { kind: 'world' };
  } else {
    const at = line.peek();
    const e = postfix(line, scope);
    if (e.kind === 'varProp') {
      name = e.prop;
      scopeOf = { kind: 'figures', target: { kind: 'value', expr: { kind: 'var', name: e.name } } };
    } else if (e.kind === 'figureVar') {
      name = e.name;
      scopeOf = { kind: 'figures', target: { kind: 'ref', ref: e.ref } };
    } else if (e.kind === 'prop') {
      name = e.prop;
      const base = e.of;
      scopeOf = {
        kind: 'figures',
        target: base.kind === 'targets' ? base.target : { kind: 'value', expr: base },
      };
    } else {
      return line.fail('expectedName', at);
    }
  }
  const op = line.next();
  if (!op || op.kind !== 'symbol' || !['=', '+', '-'].includes(op.text)) {
    return line.fail('expected', op, { expected: '= + -', found: op?.text ?? '' });
  }
  return {
    kind: 'setVar',
    scope: scopeOf,
    name,
    op: op.text as '=' | '+' | '-',
    value: expr(line, scope),
  };
}

/** Is this line the start of a block statement (for error recovery)? */
export function opensBlock(line: Line): boolean {
  return (
    line.isWord(KW.when) ||
    line.isPhrase(STMT_KW.repeat) ||
    line.isPhrase(STMT_KW.forEach) ||
    line.isPhrase(STMT_KW.while) ||
    line.isPhrase(STMT_KW.after)
  );
}

/** Is the line a code statement (and not a plain action of the rule language)? */
export function isCodeStmt(line: Line): boolean {
  if (opensBlock(line)) return true;
  if (line.isWord(KW.else)) return false;
  for (const p of [
    STMT_KW.pick,
    STMT_KW.let,
    STMT_KW.play,
    STMT_KW.texture,
    STMT_KW.wait,
    STMT_KW.return,
    STMT_KW.send,
  ]) {
    if (line.isPhrase(p)) return true;
  }
  // ZEIGE with a computed text
  if (line.isWord(ACTION_KW.message)) {
    return !(line.peek(1)?.kind === 'string' && line.peek(2) === undefined);
  }
  return false;
}

/** Parses one statement line (block bodies follow on the next lines). */
export function stmtLine(line: Line, scope: CodeScope): StmtLine {
  const lineNo = line.lineNo;
  const done = (stmt: Stmt, opens: Stmt[] | null = null): StmtLine => {
    line.end();
    stmt.line = lineNo;
    return { stmt, opens };
  };
  if (line.isWord(KW.when)) {
    line.next();
    const cond = expr(line, scope);
    if (line.isWord(KW.then)) line.next();
    const stmt: Stmt = { kind: 'if', cond, then: [], else: [] };
    return done(stmt, stmt.then);
  }
  if (line.isPhrase(STMT_KW.repeat)) {
    line.expectPhrase(STMT_KW.repeat);
    const times = expr(line, scope);
    line.expectPhrase(STMT_KW.times);
    const stmt: Stmt = { kind: 'repeat', times, body: [] };
    return done(stmt, stmt.body);
  }
  if (line.isPhrase(STMT_KW.forEach)) {
    line.expectPhrase(STMT_KW.forEach);
    const name = varName(line);
    line.expectPhrase(STMT_KW.in);
    const set = expr(line, scope);
    declare(scope, name);
    const stmt: Stmt = { kind: 'forEach', var: name, in: set, body: [] };
    return done(stmt, stmt.body);
  }
  if (line.isPhrase(STMT_KW.while)) {
    line.expectPhrase(STMT_KW.while);
    const stmt: Stmt = { kind: 'while', cond: expr(line, scope), body: [] };
    return done(stmt, stmt.body);
  }
  if (line.isPhrase(STMT_KW.after)) {
    line.expectPhrase(STMT_KW.after);
    const rounds = line.number();
    roundsWord(line);
    const stmt: Stmt = { kind: 'after', rounds, body: [] };
    return done(stmt, stmt.body);
  }
  if (line.isPhrase(STMT_KW.pick)) {
    line.expectPhrase(STMT_KW.pick);
    const name = varName(line);
    line.expectPhrase(STMT_KW.from);
    const from = expr(line, scope);
    declare(scope, name);
    return done({ kind: 'pick', var: name, from });
  }
  if (line.isPhrase(STMT_KW.let)) {
    line.expectPhrase(STMT_KW.let);
    const name = varName(line);
    line.expectSymbol('=');
    const value = expr(line, scope);
    declare(scope, name);
    return done({ kind: 'let', name, value });
  }
  if (line.isPhrase(STMT_KW.play)) {
    line.expectPhrase(STMT_KW.play);
    return done({ kind: 'play', sound: expr(line, scope) });
  }
  if (line.isPhrase(STMT_KW.texture)) {
    line.expectPhrase(STMT_KW.texture);
    const tile = postfix(line, scope);
    return done({ kind: 'texture', tile, name: expr(line, scope) });
  }
  if (line.isPhrase(STMT_KW.wait)) {
    line.expectPhrase(STMT_KW.wait);
    return done({ kind: 'wait', seconds: line.decimal() });
  }
  if (line.isPhrase(STMT_KW.return)) {
    line.expectPhrase(STMT_KW.return);
    return done({ kind: 'return', value: expr(line, scope) });
  }
  if (line.isPhrase(STMT_KW.send)) {
    line.expectPhrase(STMT_KW.send);
    return done({ kind: 'send', event: line.string().toLowerCase() });
  }
  if (line.isWord(ACTION_KW.message)) {
    if (line.peek(1)?.kind === 'string' && line.peek(2) === undefined) {
      line.next();
      return done({ kind: 'do', effect: { kind: 'message', text: line.string() } });
    }
    line.next();
    return done({ kind: 'say', text: expr(line, scope) });
  }
  if (line.isWord(ACTION_KW.setVar)) {
    line.next();
    return done({ kind: 'do', effect: setVar(line, scope) });
  }
  const first = line.peek();
  // liste.füge_hinzu(x)
  if (
    first?.kind === 'word' &&
    line.isSymbol('.', 1) &&
    line.peek(2)?.kind === 'word' &&
    line.isSymbol('(', 3)
  ) {
    const method = line.peek(2)?.text ?? '';
    if (lookup(LIST_W, method) !== 'add') {
      return line.fail('unknownMethod', line.peek(2), { found: method });
    }
    line.next();
    line.next();
    line.next();
    line.expectSymbol('(');
    const value = expr(line, scope);
    line.expectSymbol(')');
    return done({ kind: 'listAdd', list: first.text, value });
  }
  return done({ kind: 'do', effect: action(line, codeParsers(scope)) });
}
