// Line-based tokenizer for the rule language (SPEC 5.3). Comments start with #.

export type TokenKind = 'word' | 'number' | 'string' | 'symbol' | 'newline' | 'eof';

export interface Token {
  kind: TokenKind;
  text: string;
  /** 1-based */
  line: number;
  /** 1-based */
  col: number;
}

export interface LexError {
  code: 'unterminatedString' | 'unexpectedChar';
  line: number;
  col: number;
  params?: Record<string, string>;
}

const WORD_START = /[A-Za-zÄÖÜäöüß_]/;
const WORD_PART = /[A-Za-zÄÖÜäöüß_0-9]/;
const TWO_CHAR = new Set(['!=', '<=', '>=']);
const ONE_CHAR = new Set([
  '=',
  '<',
  '>',
  '+',
  '-',
  '*',
  '/',
  '%',
  '(',
  ')',
  '[',
  ']',
  '.',
  ',',
  ':',
]);

export function tokenize(source: string): { tokens: Token[]; errors: LexError[] } {
  const tokens: Token[] = [];
  const errors: LexError[] = [];
  const lines = source.replace(/\r\n?/g, '\n').split('\n');
  lines.forEach((text, i) => {
    const line = i + 1;
    let pos = 0;
    let emitted = false;
    while (pos < text.length) {
      const ch = text[pos] ?? '';
      const col = pos + 1;
      if (ch === ' ' || ch === '\t') {
        pos++;
        continue;
      }
      if (ch === '#') break;
      if (ch === '"' || ch === '„' || ch === '“') {
        let value = '';
        let end = pos + 1;
        let closed = false;
        while (end < text.length) {
          const c = text[end] ?? '';
          if (c === '\\' && end + 1 < text.length) {
            value += text[end + 1];
            end += 2;
            continue;
          }
          if (c === '"' || c === '“' || c === '”') {
            closed = true;
            break;
          }
          value += c;
          end++;
        }
        if (!closed) {
          errors.push({ code: 'unterminatedString', line, col });
          pos = text.length;
          continue;
        }
        tokens.push({ kind: 'string', text: value, line, col });
        emitted = true;
        pos = end + 1;
        continue;
      }
      if (/[0-9]/.test(ch)) {
        let end = pos;
        while (end < text.length && /[0-9]/.test(text[end] ?? '')) end++;
        tokens.push({ kind: 'number', text: text.slice(pos, end), line, col });
        emitted = true;
        pos = end;
        continue;
      }
      if (WORD_START.test(ch)) {
        let end = pos;
        while (end < text.length && WORD_PART.test(text[end] ?? '')) end++;
        tokens.push({ kind: 'word', text: text.slice(pos, end), line, col });
        emitted = true;
        pos = end;
        continue;
      }
      const two = text.slice(pos, pos + 2);
      if (TWO_CHAR.has(two)) {
        tokens.push({ kind: 'symbol', text: two, line, col });
        emitted = true;
        pos += 2;
        continue;
      }
      if (ONE_CHAR.has(ch)) {
        tokens.push({ kind: 'symbol', text: ch, line, col });
        emitted = true;
        pos++;
        continue;
      }
      errors.push({ code: 'unexpectedChar', line, col, params: { char: ch } });
      pos++;
    }
    if (emitted) tokens.push({ kind: 'newline', text: '', line, col: text.length + 1 });
  });
  tokens.push({ kind: 'eof', text: '', line: lines.length + 1, col: 1 });
  return { tokens, errors };
}
