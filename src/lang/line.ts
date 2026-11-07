// Token cursor for one source line, shared by the rule parser and the code parser.
import { fold, lookup, spellings, type Phrase } from './keywords';
import type { RuleAST } from './ast';
import type { Token } from './lexer';
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

export class LineError extends Error {
  constructor(readonly error: ParseError) {
    super(error.code);
  }
}

/** Cursor over the tokens of one line. */
export class Line {
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

  /** Number of tokens a (multi-word) keyword spans here, or 0 if it does not match. */
  phraseLength(p: Phrase, offset = 0): number {
    for (const spelling of [p.de, p.en, ...(p.alt ?? [])]) {
      const words = spelling.split(' ');
      const match = words.every((w, i) => {
        const t = this.peek(offset + i);
        return !!t && t.kind === 'word' && fold(t.text) === fold(w);
      });
      if (match) return words.length;
    }
    return 0;
  }

  isPhrase(p: Phrase, offset = 0): boolean {
    return this.phraseLength(p, offset) > 0;
  }

  expectPhrase(p: Phrase): void {
    const n = this.phraseLength(p);
    if (n === 0) {
      this.fail('expected', this.peek(), { expected: p.de, found: this.peek()?.text ?? '' });
    }
    for (let i = 0; i < n; i++) this.next();
  }

  /** A decimal number such as 0.5 (the lexer splits it into 0 . 5). */
  decimal(): number {
    const whole = this.number();
    const dot = this.peek();
    const frac = this.peek(1);
    if (dot?.kind === 'symbol' && dot.text === '.' && frac?.kind === 'number') {
      this.next();
      this.next();
      return Number(`${whole}.${frac.text}`);
    }
    return whole;
  }

  end(): void {
    const t = this.peek();
    if (t) this.fail('trailing', t, { found: t.text });
  }
}
