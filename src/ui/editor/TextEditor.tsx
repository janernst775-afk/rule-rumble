import { useRef, type Ref } from 'react';
import { useTranslation } from 'react-i18next';
import type { Diagnostic } from '../../lang/diagnose';
import { tokenize } from '../../lang/lexer';
import { fold, KW } from '../../lang/keywords';

interface Props {
  ref?: Ref<HTMLTextAreaElement>;
  value: string;
  onChange: (v: string) => void;
  diagnostics: Diagnostic[];
  message: (d: Diagnostic) => string;
}

/** Text view of the rule editor: plain textarea with line numbers and error list. */
export function TextEditor({ ref, value, onChange, diagnostics, message }: Props) {
  const { t } = useTranslation();
  const gutter = useRef<HTMLDivElement>(null);
  const area = useRef<HTMLTextAreaElement | null>(null);
  const lines = Math.max(1, value.split('\n').length);
  const errorLines = new Set(diagnostics.map((d) => d.line));

  const jumpTo = (line: number) => {
    const el = area.current;
    if (!el) return;
    const before = value
      .split('\n')
      .slice(0, line - 1)
      .join('\n');
    const start = line > 1 ? before.length + 1 : 0;
    const end = start + (value.split('\n')[line - 1]?.length ?? 0);
    el.focus();
    el.setSelectionRange(start, end);
  };

  return (
    <div className="text-editor">
      <div className="text-editor-frame">
        <div ref={gutter} className="text-gutter" aria-hidden="true">
          {Array.from({ length: lines }, (_, i) => (
            <span key={i} className={errorLines.has(i + 1) ? 'has-error' : undefined}>
              {i + 1}
            </span>
          ))}
        </div>
        <textarea
          ref={(el) => {
            area.current = el;
            if (typeof ref === 'function') ref(el);
            else if (ref) (ref as { current: HTMLTextAreaElement | null }).current = el;
          }}
          className="text-area"
          aria-label={t('editor.textLabel')}
          spellCheck={false}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onScroll={(e) => {
            if (gutter.current) gutter.current.scrollTop = e.currentTarget.scrollTop;
          }}
        />
      </div>
      {diagnostics.length > 0 ? (
        <ul className="diagnostics" role="alert">
          {diagnostics.map((d, i) => (
            <li key={`${d.line}:${d.col}:${i}`}>
              <button type="button" className="diag-btn" onClick={() => jumpTo(d.line)}>
                {t('editor.lineMessage', { line: d.line, message: message(d) })}
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="diag-ok">{t('editor.checked')}</p>
      )}
    </div>
  );
}

const TONE: [string, { de: string; en: string }][] = [
  ['when', KW.when],
  ['and', KW.and],
  ['then', KW.then],
  ['else', KW.else],
  ['meta', KW.duration],
  ['meta', KW.limit],
  ['rule', KW.rule],
];

/** Colored preview like the reference ("Als Text"). */
export function HighlightedRule({ text }: { text: string }) {
  return (
    <pre className="code-highlight">
      {text.split('\n').map((line, i) => {
        const tokens = tokenize(line).tokens.filter(
          (tok) => tok.kind !== 'newline' && tok.kind !== 'eof',
        );
        const first = tokens[0];
        const tone = first
          ? TONE.find(
              ([, w]) => fold(w.de) === fold(first.text) || fold(w.en) === fold(first.text),
            )?.[0]
          : undefined;
        const head = first ? line.slice(0, first.col - 1 + first.text.length) : '';
        const rest = first ? line.slice(first.col - 1 + first.text.length) : line;
        return (
          <span key={i} className="code-line">
            <span className={tone ? `kw-${tone}` : undefined}>{head}</span>
            {rest.split(/("(?:[^"\\]|\\.)*")/).map((part, j) =>
              part.startsWith('"') ? (
                <span key={j} className="code-string">
                  {part}
                </span>
              ) : (
                <span key={j}>{part}</span>
              ),
            )}
            {'\n'}
          </span>
        );
      })}
    </pre>
  );
}
