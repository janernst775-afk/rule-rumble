// CodeMirror support for the rule language and Profi-Code (SPEC 5.8): syntax colors,
// autocompletion and diagnostics. All words come from lang/keywords.ts.
import type { Completion, CompletionContext, CompletionResult } from '@codemirror/autocomplete';
import { HighlightStyle, StreamLanguage, type StringStream } from '@codemirror/language';
import { tags } from '@lezer/highlight';
import {
  ACTION_KW,
  DEF_KW,
  EVENT_KW,
  FIGURE_PROP_W,
  KW,
  LIST_W,
  NONE_W,
  PARAM_TYPE_W,
  QUERY_W,
  SELF_W,
  STMT_KW,
  TARGET_W,
  TILE_PROP_W,
  TILE_TYPE_W,
  TILE_W,
  VALUE_W,
  fold,
  type CodeLang,
} from '../../lang/keywords';

type Words = Record<string, { de: string; en: string; alt?: readonly string[] }>;

function wordsOf(...tables: Words[]): Set<string> {
  const out = new Set<string>();
  for (const table of tables) {
    for (const w of Object.values(table)) {
      for (const spelling of [w.de, w.en, ...(w.alt ?? [])]) {
        for (const part of spelling.split(' ')) out.add(fold(part));
      }
    }
  }
  return out;
}

const ACTION_WORDS = wordsOf(ACTION_KW, {
  play: STMT_KW.play,
  texture: STMT_KW.texture,
  wait: STMT_KW.wait,
  send: STMT_KW.send,
  let: STMT_KW.let,
});
const LOGIC_WORDS = wordsOf({
  and: KW.and,
  or: KW.or,
  not: KW.not,
  chance: KW.chance,
  none: NONE_W,
});
const DEF_WORDS = wordsOf(DEF_KW, { rule: KW.rule });
const TYPE_WORDS = wordsOf(PARAM_TYPE_W);
const KEYWORDS = wordsOf(KW, STMT_KW, EVENT_KW);
const VALUE_WORDS = wordsOf(TARGET_W, TILE_W, VALUE_W, QUERY_W, TILE_TYPE_W, { self: SELF_W });

interface LexState {
  /** The previous token was a dot: the word is a property. */
  afterDot: boolean;
}

function token(stream: StringStream, state: LexState): string | null {
  if (stream.eatSpace()) return null;
  if (stream.peek() === '#') {
    stream.skipToEnd();
    return 'comment';
  }
  const ch = stream.next();
  if (!ch) return null;
  if (ch === '"' || ch === '„' || ch === '“') {
    while (!stream.eol()) {
      const c = stream.next();
      if (c === '\\') stream.next();
      else if (c === '"' || c === '“' || c === '”') break;
    }
    state.afterDot = false;
    return 'string';
  }
  if (/[0-9]/.test(ch)) {
    stream.eatWhile(/[0-9.]/);
    state.afterDot = false;
    return 'number';
  }
  if (/[A-Za-zÄÖÜäöüß_]/.test(ch)) {
    stream.eatWhile(/[A-Za-zÄÖÜäöüß_0-9]/);
    const word = fold(stream.current());
    const wasDot = state.afterDot;
    state.afterDot = false;
    if (wasDot) return 'propertyName';
    if (DEF_WORDS.has(word)) return 'definition';
    if (ACTION_WORDS.has(word)) return 'action';
    if (LOGIC_WORDS.has(word)) return 'logic';
    if (TYPE_WORDS.has(word) && /^[A-ZÄÖÜ]/.test(stream.current())) return 'typeName';
    if (KEYWORDS.has(word) && stream.current() === stream.current().toUpperCase()) {
      return 'keyword';
    }
    if (VALUE_WORDS.has(word)) return 'atom';
    return 'variableName';
  }
  state.afterDot = ch === '.';
  return 'operator';
}

export const ruleLanguage = StreamLanguage.define<LexState>({
  name: 'rule-rumble',
  startState: () => ({ afterDot: false }),
  token,
  languageData: { commentTokens: { line: '#' } },
  tokenTable: {
    definition: tags.definitionKeyword,
    action: tags.controlKeyword,
    logic: tags.operatorKeyword,
  },
});

/** Colors as in reference screen 7 (dark code panel). */
export const ruleHighlight = HighlightStyle.define([
  { tag: tags.keyword, color: '#ffc83d' },
  { tag: tags.definitionKeyword, color: '#ffffff', fontWeight: '600' },
  { tag: tags.controlKeyword, color: '#5ee0a0' },
  { tag: tags.operatorKeyword, color: '#6cb8ff' },
  { tag: tags.typeName, color: '#6cb8ff' },
  { tag: tags.string, color: '#ff9ad5' },
  { tag: tags.number, color: '#ffffff' },
  { tag: tags.comment, color: '#8f7fb5', fontStyle: 'italic' },
  { tag: tags.atom, color: '#e2d6ff' },
  { tag: tags.propertyName, color: '#c9b8ff' },
  { tag: tags.variableName, color: '#ffffff' },
  { tag: tags.operator, color: '#e2d6ff' },
]);

/** Own things that autocompletion offers next to the language words. */
export interface CompletionWords {
  effects: { name: string; params: string[] }[];
  functions: { name: string; params: string[] }[];
  textures: string[];
  sounds: string[];
  npcTypes: string[];
  /** Translated detail labels. */
  labels: Record<
    'keyword' | 'action' | 'value' | 'effect' | 'function' | 'texture' | 'sound' | 'npc' | 'prop',
    string
  >;
}

function spell(table: Words, lang: CodeLang): string[] {
  return Object.values(table).map((w) => w[lang]);
}

/** Builds the completion source for one editor. */
export function completionSource(words: () => CompletionWords, lang: () => CodeLang) {
  return (context: CompletionContext): CompletionResult | null => {
    const before = context.matchBefore(/[A-Za-zÄÖÜäöüß_][A-Za-zÄÖÜäöüß_0-9]*/);
    const dot = context.matchBefore(/\.[A-Za-zÄÖÜäöüß_0-9]*/);
    if (!before && !context.explicit && !dot) return null;
    const w = words();
    const l = lang();
    if (dot) {
      const props = [
        ...spell(FIGURE_PROP_W, l),
        ...spell(TILE_PROP_W, l),
        LIST_W.length[l],
        LIST_W.add[l],
      ];
      return {
        from: dot.from + 1,
        options: props.map((label) => ({ label, type: 'property', detail: w.labels.prop })),
      };
    }
    const options: Completion[] = [
      ...[
        ...spell(KW, l),
        ...spell(STMT_KW, l),
        ...spell(DEF_KW, l),
        ...spell(EVENT_KW, l),
        ...spell(PARAM_TYPE_W, l),
      ].map((label) => ({ label, type: 'keyword', detail: w.labels.keyword })),
      ...spell(ACTION_KW, l).map((label) => ({
        label,
        type: 'function',
        detail: w.labels.action,
      })),
      ...[
        ...spell(TARGET_W, l),
        ...spell(TILE_W, l),
        ...spell(VALUE_W, l),
        ...spell(QUERY_W, l),
        ...spell(TILE_TYPE_W, l),
        SELF_W[l],
        NONE_W[l],
      ].map((label) => ({ label, type: 'variable', detail: w.labels.value })),
      ...w.effects.map((e) => ({
        label: e.name,
        apply: `${e.name}(${e.params.join(', ')})`,
        type: 'class',
        detail: w.labels.effect,
      })),
      ...w.functions.map((f) => ({
        label: f.name,
        apply: `${f.name}(${f.params.join(', ')})`,
        type: 'method',
        detail: w.labels.function,
      })),
      ...w.textures.map((name) => ({
        label: `"${name}"`,
        type: 'text',
        detail: w.labels.texture,
      })),
      ...w.sounds.map((name) => ({ label: `"${name}"`, type: 'text', detail: w.labels.sound })),
      ...w.npcTypes.map((id) => ({ label: id, type: 'type', detail: w.labels.npc })),
    ];
    // Multi-word keywords are offered whole; deduplicate by label.
    const seen = new Set<string>();
    const unique = options.filter((o) => (seen.has(o.label) ? false : (seen.add(o.label), true)));
    return {
      from: before ? before.from : context.pos,
      options: unique,
      validFor: /^[\wÄÖÜäöüß]*$/,
    };
  };
}
