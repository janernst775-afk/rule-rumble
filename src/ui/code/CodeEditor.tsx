import { autocompletion, closeBrackets, completionKeymap } from '@codemirror/autocomplete';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { bracketMatching, indentUnit, syntaxHighlighting } from '@codemirror/language';
import { lintGutter, setDiagnostics, type Diagnostic as CmDiagnostic } from '@codemirror/lint';
import { EditorState, StateEffect, StateField, type Extension } from '@codemirror/state';
import {
  Decoration,
  EditorView,
  drawSelection,
  highlightActiveLine,
  keymap,
  lineNumbers,
  type DecorationSet,
} from '@codemirror/view';
import { useEffect, useRef } from 'react';
import type { CodeLang } from '../../lang/keywords';
import { completionSource, ruleHighlight, ruleLanguage, type CompletionWords } from './language';

export interface CodeProblem {
  line: number;
  col?: number;
  message: string;
}

interface Props {
  value: string;
  onChange?: (value: string) => void;
  problems: CodeProblem[];
  /** Words for autocompletion (own effects, functions, textures, sounds …). */
  words: CompletionWords;
  lang: CodeLang;
  label: string;
  readOnly?: boolean;
  /** Debugger: the line of the current step. */
  activeLine?: number | null;
  minHeight?: number;
}

const setActiveLine = StateEffect.define<number | null>();

const activeLineField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(deco, tr) {
    for (const e of tr.effects) {
      if (!e.is(setActiveLine)) continue;
      const line = e.value;
      if (line === null || line < 1 || line > tr.state.doc.lines) return Decoration.none;
      const from = tr.state.doc.line(line).from;
      return Decoration.set([Decoration.line({ class: 'cm-debug-line' }).range(from)]);
    }
    return deco.map(tr.changes);
  },
  provide: (f) => EditorView.decorations.from(f),
});

function toDiagnostics(state: EditorState, problems: CodeProblem[]): CmDiagnostic[] {
  return problems.map((p) => {
    const line = state.doc.line(Math.max(1, Math.min(state.doc.lines, p.line)));
    const from = Math.min(line.to, line.from + Math.max(0, (p.col ?? 1) - 1));
    return {
      from: p.col ? from : line.from,
      to: line.to > from ? line.to : from,
      severity: 'error',
      message: p.message,
    };
  });
}

/** CodeMirror 6 editor for rules, effects and Profi-Code (SPEC 5.8 "Code-Editor"). */
export function CodeEditor({
  value,
  onChange,
  problems,
  words,
  lang,
  label,
  readOnly = false,
  activeLine = null,
  minHeight = 320,
}: Props) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  // Callbacks and words change on every render; the editor reads them through refs.
  const latest = useRef({ onChange, words, lang });
  useEffect(() => {
    latest.current = { onChange, words, lang };
  });

  useEffect(() => {
    if (!host.current) return;
    const extensions: Extension[] = [
      lineNumbers(),
      history(),
      drawSelection(),
      highlightActiveLine(),
      bracketMatching(),
      closeBrackets(),
      indentUnit.of('  '),
      ruleLanguage,
      syntaxHighlighting(ruleHighlight),
      lintGutter(),
      activeLineField,
      autocompletion({
        override: [
          completionSource(
            () => latest.current.words,
            () => latest.current.lang,
          ),
        ],
      }),
      keymap.of([...defaultKeymap, ...historyKeymap, ...completionKeymap, indentWithTab]),
      EditorView.contentAttributes.of({ 'aria-label': label, spellcheck: 'false' }),
      EditorState.readOnly.of(readOnly),
      EditorView.updateListener.of((u) => {
        if (u.docChanged) latest.current.onChange?.(u.state.doc.toString());
      }),
    ];
    const v = new EditorView({
      parent: host.current,
      state: EditorState.create({ doc: value, extensions }),
    });
    view.current = v;
    return () => {
      v.destroy();
      view.current = null;
    };
    // The editor is created once; value changes are synced below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readOnly, label]);

  // Outside changes (switching effects, printing from blocks) replace the text.
  useEffect(() => {
    const v = view.current;
    if (!v) return;
    const current = v.state.doc.toString();
    if (current !== value) {
      v.dispatch({ changes: { from: 0, to: current.length, insert: value } });
    }
  }, [value]);

  useEffect(() => {
    const v = view.current;
    if (!v) return;
    v.dispatch(setDiagnostics(v.state, toDiagnostics(v.state, problems)));
  }, [problems, value]);

  useEffect(() => {
    const v = view.current;
    if (!v) return;
    const effects: StateEffect<unknown>[] = [setActiveLine.of(activeLine)];
    if (activeLine && activeLine <= v.state.doc.lines) {
      effects.push(EditorView.scrollIntoView(v.state.doc.line(activeLine).from, { y: 'nearest' }));
    }
    v.dispatch({ effects });
  }, [activeLine]);

  return <div ref={host} className="code-editor" style={{ minHeight }} />;
}
