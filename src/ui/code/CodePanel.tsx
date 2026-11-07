import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { CodeLang } from '../../lang/keywords';
import { CodeEditor, type CodeProblem } from './CodeEditor';
import type { CompletionWords } from './language';

interface Props {
  file: string;
  value: string;
  onChange: (v: string) => void;
  problems: CodeProblem[];
  words: CompletionWords;
  lang: CodeLang;
  activeLine?: number | null;
  /** Status line under the editor (test run, hints). */
  footer?: ReactNode;
}

/** Dark code panel of the effect workshop (reference screen 7). */
export function CodePanel({
  file,
  value,
  onChange,
  problems,
  words,
  lang,
  activeLine,
  footer,
}: Props) {
  const { t } = useTranslation();
  return (
    <section className="code-panel" aria-label={t('workshop.codeLabel')}>
      <header className="code-panel-head">
        <span className="code-file">{file}</span>
        {problems.length === 0 ? (
          <span className="code-badge ok">{t('workshop.checkedBadge')}</span>
        ) : (
          <span className="code-badge bad">
            {t('workshop.errorsBadge', { count: problems.length })}
          </span>
        )}
      </header>
      <CodeEditor
        value={value}
        onChange={onChange}
        problems={problems}
        words={words}
        lang={lang}
        label={file}
        activeLine={activeLine ?? null}
      />
      {problems.length > 0 && (
        <ul className="code-problems" role="alert">
          {problems.slice(0, 6).map((p, i) => (
            <li key={i}>{t('editor.lineMessage', { line: p.line, message: p.message })}</li>
          ))}
        </ul>
      )}
      {footer && <footer className="code-panel-foot">{footer}</footer>}
    </section>
  );
}
