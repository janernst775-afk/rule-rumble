// Recursive-descent parser for the rule language (SPEC 5.3), effect texts (5.7) and
// Profi-Code (5.8). One text may hold rules, own effects, functions and NPC behaviors.
// Rules are line based; blocks (WENN … ENDE, FÜR JEDE … ENDE, …) span several lines.
// Errors carry line, column and – where possible – a suggestion ("Meintest du …?").
import type {
  EffectDef,
  EffectParam,
  Expr,
  FunctionDef,
  NpcCode,
  ParamType,
  ProgramAST,
  RuleAST,
  RuleLimit,
  Stmt,
  Trigger,
  Effect,
} from './ast';
import { expr, isCodeStmt, newScope, opensBlock, stmtLine, type CodeScope } from './codeSyntax';
import { DEF_KW, KW, PARAM_TYPE_W, STMT_KW, lookup, spellings } from './keywords';
import { tokenize, type Token } from './lexer';
import { Line, LineError, type ParseError, type ParsedRule, type RuleLines } from './line';
import { EFFECT_NAME, RULE_PARSERS, action, orExpr, roundsWord, trigger } from './ruleSyntax';
import { suggest } from './suggest';

export type { ParseError, ParsedRule, RuleLines } from './line';

/** Source lines of the definitions in a code text. */
export interface ProgramLines {
  effects: number[];
  functions: number[];
  npcCode: number[];
}

export interface ParsedProgram {
  program: ProgramAST;
  rules: ParsedRule[];
  lines: ProgramLines;
}

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
  scope: CodeScope;
  /** A line of this rule had an error: suppress follow-up "missing" errors. */
  failed: boolean;
}

/** An open block: the lines that follow fill `target` until ENDE. */
interface Frame {
  line: number;
  target: Stmt[];
  /** WENN block: SONST switches to the else list. */
  ifStmt: Extract<Stmt, { kind: 'if' }> | null;
  inElse: boolean;
  /** The block is the body of a definition (EFFEKT, FUNKTION, NPC). */
  def: 'effect' | 'function' | 'npc' | null;
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

const PARAM_TYPE_KEYS = PARAM_TYPE_W as Record<ParamType, { de: string; en: string }>;

/** ( name: Typ, … ) of an effect header; the list is optional. */
function effectParams(line: Line): EffectParam[] {
  const params: EffectParam[] = [];
  if (!line.isSymbol('(')) return params;
  line.next();
  if (!line.isSymbol(')')) {
    for (;;) {
      const name = line.next();
      if (!name || name.kind !== 'word') return line.fail('expectedName', name);
      line.expectSymbol(':');
      const type = line.expectWord(PARAM_TYPE_KEYS, 'unknownParamType');
      params.push({ name: name.text, type });
      if (!line.isSymbol(',')) break;
      line.next();
    }
  }
  line.expectSymbol(')');
  return params;
}

/** ( a, b ) of a function header. */
function functionParams(line: Line): string[] {
  const params: string[] = [];
  line.expectSymbol('(');
  if (!line.isSymbol(')')) {
    for (;;) {
      const name = line.next();
      if (!name || name.kind !== 'word') return line.fail('expectedName', name);
      params.push(name.text);
      if (!line.isSymbol(',')) break;
      line.next();
    }
  }
  line.expectSymbol(')');
  return params;
}

function nameOrString(line: Line): string {
  const t = line.peek();
  if (t?.kind === 'string') return line.string();
  const name = line.next();
  if (!name || name.kind !== 'word') return line.fail('expectedName', name);
  return name.text;
}

/** Parses a code text with rules, effects, functions and NPC behaviors. */
export function parseProgram(source: string): { parsed: ParsedProgram; errors: ParseError[] } {
  const { tokens, errors: lexErrors } = tokenize(source);
  const errors: ParseError[] = lexErrors.map((e) => ({ ...e }) as ParseError);
  const program: ProgramAST = { rules: [], effects: [], functions: [], npcCode: [] };
  const rules: ParsedRule[] = [];
  const lines: ProgramLines = { effects: [], functions: [], npcCode: [] };
  let draft: Draft | null = null;
  /** Scope of the definition being parsed (EFFEKT, FUNKTION, NPC). */
  let defScope: CodeScope | null = null;
  const frames: Frame[] = [];

  const finishRule = () => {
    if (!draft) return;
    const d = draft;
    if (!d.failed && !d.trigger) errors.push({ code: 'missingWhen', line: d.lines.name, col: 1 });
    if (!d.failed && d.effects.length === 0) {
      errors.push({ code: 'missingThen', line: d.lines.name, col: 1 });
    }
    if (d.trigger) {
      const ast: RuleAST = {
        name: d.name,
        trigger: d.trigger,
        conditions: d.conditions,
        effects: d.effects,
        elseEffects: d.elseEffects,
        duration: d.duration,
        limit: d.limit,
      };
      program.rules.push(ast);
      rules.push({ ast, lines: d.lines });
    }
    draft = null;
  };

  const push = (frame: Omit<Frame, 'inElse' | 'ifStmt' | 'def'> & Partial<Frame>) => {
    frames.push({ ifStmt: null, inElse: false, def: null, ...frame });
  };

  /** A statement line inside a block. */
  const blockLine = (line: Line, scope: CodeScope) => {
    const top = frames[frames.length - 1]!;
    if (line.isPhrase(STMT_KW.end)) {
      line.expectPhrase(STMT_KW.end);
      line.end();
      frames.pop();
      if (top.def) defScope = null;
      return;
    }
    if (line.isWord(KW.else) && line.peek(1) === undefined) {
      if (!top.ifStmt || top.inElse) line.fail('misplacedElse', line.peek());
      line.next();
      top.inElse = true;
      top.target = top.ifStmt.else;
      return;
    }
    try {
      const { stmt, opens } = stmtLine(line, scope);
      top.target.push(stmt);
      if (opens) {
        push({
          line: line.lineNo,
          target: opens,
          ifStmt: stmt.kind === 'if' ? stmt : null,
        });
      }
    } catch (e) {
      // Keep ENDE lines balanced after a broken block header.
      if (e instanceof LineError && opensBlock(new Line(lineTokens, line.lineNo))) {
        push({ line: line.lineNo, target: [] });
      }
      throw e;
    }
  };

  /** DANN / SONST of a rule: a plain action or one code statement (maybe a block). */
  const ruleEffect = (line: Line, d: Draft): Effect => {
    if (!isCodeStmt(line)) return action(line, { ...RULE_PARSERS, value: (l) => expr(l, d.scope) });
    const { stmt, opens } = stmtLine(line, d.scope);
    if (opens) {
      push({ line: line.lineNo, target: opens, ifStmt: stmt.kind === 'if' ? stmt : null });
    }
    return { kind: 'code', stmt };
  };

  let lineTokens: Token[] = [];
  for (const toks of splitLines(tokens)) {
    const first = toks[0];
    if (!first) continue;
    lineTokens = toks;
    // Explicit type so that `never`-returning fail() narrows (TS control flow).
    const line: Line = new Line(toks, first.line);
    try {
      if (frames.length > 0) {
        const scope = defScope ?? draft?.scope ?? newScope();
        blockLine(line, scope);
        continue;
      }
      if (line.isWord(DEF_KW.effect)) {
        finishRule();
        line.next();
        const name = nameOrString(line);
        const params = effectParams(line);
        line.end();
        const def: EffectDef = { name, author: '', symbol: '', params, body: [] };
        program.effects.push(def);
        lines.effects.push(line.lineNo);
        defScope = newScope(params.map((p) => p.name));
        push({ line: line.lineNo, target: def.body, def: 'effect' });
        continue;
      }
      if (line.isWord(DEF_KW.function)) {
        finishRule();
        line.next();
        const name = line.next();
        if (!name || name.kind !== 'word' || !EFFECT_NAME.test(name.text)) {
          line.fail('expectedName', name);
        }
        const params = functionParams(line);
        line.end();
        const def: FunctionDef = { name: name.text, author: '', params, body: [] };
        program.functions.push(def);
        lines.functions.push(line.lineNo);
        defScope = newScope(params);
        push({ line: line.lineNo, target: def.body, def: 'function' });
        continue;
      }
      if (line.isWord(DEF_KW.npc)) {
        finishRule();
        line.next();
        const npc = nameOrString(line);
        line.expectKw(KW.turn);
        line.end();
        const code: NpcCode = { npc, body: [] };
        program.npcCode.push(code);
        lines.npcCode.push(line.lineNo);
        defScope = newScope([], true);
        push({ line: line.lineNo, target: code.body, def: 'npc' });
        continue;
      }
      if (line.isPhrase(STMT_KW.end)) line.fail('unexpectedEnd', first);
      const kind = first.kind === 'word' ? lookup(LINE_STARTS, first.text) : null;
      if (!kind) {
        line.fail(
          'unknownLine',
          first,
          { found: first.text },
          first.kind === 'word'
            ? suggest(first.text, [
                ...Object.values(LINE_STARTS).map((w) => w.de),
                ...spellings(DEF_KW, 'de'),
              ])
            : null,
        );
      }
      line.next();
      if (kind === 'rule') {
        finishRule();
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
          scope: newScope(),
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
          d.lines.effects.push(line.lineNo);
          d.effects.push(ruleEffect(line, d));
          continue;
        case 'else':
          if (d.effects.length === 0 && !d.failed) line.fail('missingThen', first);
          d.lines.elseEffects.push(line.lineNo);
          d.elseEffects.push(ruleEffect(line, d));
          continue;
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
  for (const f of frames.reverse()) {
    errors.push({ code: 'missingEnd', line: f.line, col: 1 });
  }
  finishRule();
  errors.sort((a, b) => a.line - b.line || a.col - b.col);
  return { parsed: { program, rules, lines }, errors };
}

/** Parses a text with one or more rules (no other definitions). */
export function parseRules(source: string): { rules: ParsedRule[]; errors: ParseError[] } {
  const { parsed, errors } = parseProgram(source);
  const others = [...parsed.lines.effects, ...parsed.lines.functions, ...parsed.lines.npcCode];
  for (const line of others) errors.push({ code: 'rulesOnly', line, col: 1 });
  if (parsed.rules.length === 0 && errors.length === 0) {
    errors.push({ code: 'expectedRule', line: 1, col: 1 });
  }
  errors.sort((a, b) => a.line - b.line || a.col - b.col);
  return { rules: parsed.rules, errors };
}

/** Parses exactly one rule (the editor's text view). */
export function parseRule(source: string): { rule: ParsedRule | null; errors: ParseError[] } {
  const { rules, errors } = parseRules(source);
  if (rules.length > 1) {
    errors.push({ code: 'oneRuleOnly', line: rules[1]?.lines.name ?? 1, col: 1 });
  }
  return { rule: errors.length === 0 ? (rules[0] ?? null) : null, errors };
}

/** Parses the text of exactly one own effect (the code view of the effect workshop). */
export function parseEffectText(source: string): {
  effect: EffectDef | null;
  errors: ParseError[];
} {
  const { parsed, errors } = parseProgram(source);
  const others = [
    ...parsed.rules.map((r) => r.lines.name),
    ...parsed.lines.functions,
    ...parsed.lines.npcCode,
    ...parsed.lines.effects.slice(1),
  ];
  for (const line of others) errors.push({ code: 'oneEffectOnly', line, col: 1 });
  if (parsed.program.effects.length === 0 && errors.length === 0) {
    errors.push({ code: 'expectedEffect', line: 1, col: 1 });
  }
  return { effect: errors.length === 0 ? (parsed.program.effects[0] ?? null) : null, errors };
}

/** Removes source line numbers (to compare code with blocks). */
export function stripLines<T>(value: T): T {
  return JSON.parse(JSON.stringify(value, (k, v: unknown) => (k === 'line' ? undefined : v))) as T;
}
