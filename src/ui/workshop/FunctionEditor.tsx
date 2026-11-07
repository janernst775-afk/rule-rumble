import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Settings } from '../../engine/types';
import type { FunctionDef } from '../../lang/ast';
import type { CodeLang } from '../../lang/keywords';
import { parseProgram } from '../../lang/parser';
import { printFunction } from '../../lang/printer';
import { validateFunction } from '../../lang/validator';
import { CodePanel } from '../code/CodePanel';
import type { CompletionWords } from '../code/language';
import { parseProblems, validationProblems } from '../code/problems';

interface Props {
  initial: FunctionDef | null;
  /** All saved functions (the edited one is replaced by the draft while checking). */
  functions: readonly FunctionDef[];
  settings: Settings;
  words: CompletionWords;
  lang: CodeLang;
  author: string;
  onSave: (def: FunctionDef, previousName: string | null) => void;
  onDelete?: (() => void) | undefined;
}

/** Own function in the code view (SPEC 5.8): computes values, never changes the world. */
export function FunctionEditor(props: Props) {
  const { initial, functions, settings, words, lang, author, onSave, onDelete } = props;
  const { t } = useTranslation();
  const [text, setText] = useState(() =>
    printFunction(
      initial ?? {
        name: t('workshop.newFunctionName'),
        author,
        params: ['a'],
        body: [{ kind: 'return', value: { kind: 'var', name: 'a' } }],
      },
      lang,
    ),
  );

  const check = useMemo(() => {
    const { parsed, errors } = parseProgram(text);
    const problems = parseProblems(errors, t);
    const p = parsed.program;
    const def = p.functions[0];
    const extra = p.rules.length + p.effects.length + p.npcCode.length + p.functions.length - 1;
    if (errors.length === 0 && (!def || extra > 0)) {
      problems.push({
        line: 1,
        message: t(def ? 'parse.oneFunctionOnly' : 'parse.expectedFunction'),
      });
    }
    if (!def || problems.length > 0) return { def: null, problems };
    const others = functions.filter(
      (f) =>
        f.name.toLowerCase() !== def.name.toLowerCase() &&
        f.name.toLowerCase() !== initial?.name.toLowerCase(),
    );
    const registry = [...others, def];
    problems.push(...validationProblems(validateFunction(def, settings, registry), t));
    const taken = others.some((f) => f.name.toLowerCase() === def.name.toLowerCase());
    if (taken) problems.push({ line: 1, message: t('workshop.nameTaken') });
    return { def: problems.length === 0 ? def : null, problems };
  }, [text, functions, initial, settings, t]);

  const name = check.def?.name ?? initial?.name ?? t('workshop.newFunctionName');
  return (
    <>
      <CodePanel
        file={t('workshop.fileFunction', { name })}
        value={text}
        onChange={setText}
        problems={check.problems}
        words={words}
        lang={lang}
        footer={<p className="hint">{t('workshop.functionNote')}</p>}
      />
      <aside className="editor-side">
        <div className="card">
          <h3>{t('workshop.functions')}</h3>
          <p className="hint">{t('workshop.functionNote')}</p>
        </div>
        <div className="editor-actions">
          {onDelete && (
            <button type="button" className="btn btn-soft" onClick={onDelete}>
              {t('workshop.delete')}
            </button>
          )}
          <button
            type="button"
            className="btn btn-primary"
            disabled={!check.def}
            onClick={() =>
              check.def &&
              onSave({ ...check.def, author: initial?.author || author }, initial?.name ?? null)
            }
          >
            {t('workshop.saveFunction')}
          </button>
        </div>
      </aside>
    </>
  );
}
