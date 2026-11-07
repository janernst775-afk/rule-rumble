import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { NpcType, Settings } from '../../engine/types';
import type { EffectDef, FunctionDef, ProgramAST } from '../../lang/ast';
import type { CodeLang } from '../../lang/keywords';
import { parseProgram } from '../../lang/parser';
import {
  npcTypeFor,
  validateEffect,
  validateFunction,
  validateNpcCode,
  validateRule,
} from '../../lang/validator';
import { CodePanel } from '../code/CodePanel';
import type { CodeProblem } from '../code/CodeEditor';
import type { CompletionWords } from '../code/language';
import { parseProblems, validationProblems } from '../code/problems';

interface Props {
  effects: readonly EffectDef[];
  functions: readonly FunctionDef[];
  /** All NPC types (built-in and own). */
  npcTypes: readonly NpcType[];
  /** Own NPC types: only these can get own behavior. */
  ownNpcTypes: readonly NpcType[];
  settings: Settings;
  words: CompletionWords;
  lang: CodeLang;
  onApply: (program: ProgramAST) => void;
}

function byName<T extends { name: string }>(base: readonly T[], extra: readonly T[]): T[] {
  const names = new Set(extra.map((x) => x.name.toLowerCase()));
  return [...base.filter((x) => !names.has(x.name.toLowerCase())), ...extra];
}

/**
 * A code file (SPEC 5.8): functions, effects, NPC behaviors and rules in one text, e.g.
 * the examples "schwächste()", "Geist" and "Flut". "Übernehmen" files everything away.
 */
export function ProgramEditor(props: Props) {
  const { effects, functions, npcTypes, ownNpcTypes, settings, words, lang, onApply } = props;
  const { t } = useTranslation();
  const [text, setText] = useState(() => t('workshop.programTemplate'));
  const [applied, setApplied] = useState<string | null>(null);

  const check = useMemo(() => {
    const { parsed, errors } = parseProgram(text);
    const problems: CodeProblem[] = parseProblems(errors, t);
    const p = parsed.program;
    if (errors.length > 0) return { program: null, problems };
    const allEffects = byName(effects, p.effects);
    const allFunctions = byName(functions, p.functions);
    p.functions.forEach((f, i) => {
      const line = parsed.lines.functions[i] ?? 1;
      problems.push(...validationProblems(validateFunction(f, settings, allFunctions), t, line));
    });
    p.effects.forEach((e, i) => {
      const line = parsed.lines.effects[i] ?? 1;
      const errs = validateEffect(e, settings, npcTypes, allEffects, allFunctions);
      problems.push(...validationProblems(errs, t, line));
    });
    p.npcCode.forEach((code, i) => {
      const line = parsed.lines.npcCode[i] ?? 1;
      if (!npcTypeFor(code, ownNpcTypes)) {
        problems.push({ line, message: t('workshop.npcMissing', { name: code.npc }) });
        return;
      }
      const errs = validateNpcCode(code, settings, npcTypes, allEffects, allFunctions);
      problems.push(...validationProblems(errs, t, line));
    });
    parsed.rules.forEach((r) => {
      const errs = validateRule(r.ast, settings, npcTypes, allEffects, allFunctions);
      problems.push(...validationProblems(errs, t, r.lines.name));
    });
    const empty = p.rules.length + p.effects.length + p.functions.length + p.npcCode.length === 0;
    return { program: problems.length === 0 && !empty ? p : null, problems };
  }, [text, effects, functions, npcTypes, ownNpcTypes, settings, t]);

  return (
    <>
      <CodePanel
        file={t('workshop.fileProgram')}
        value={text}
        onChange={(v) => {
          setText(v);
          setApplied(null);
        }}
        problems={check.problems}
        words={words}
        lang={lang}
        footer={applied ? <p className="diag-ok-dark">{applied}</p> : undefined}
      />
      <aside className="editor-side">
        <div className="card">
          <h3>{t('workshop.program')}</h3>
          <p className="hint">{t('workshop.programNote')}</p>
        </div>
        <div className="editor-actions">
          <button
            type="button"
            className="btn btn-primary"
            disabled={!check.program}
            onClick={() => {
              const p = check.program;
              if (!p) return;
              onApply(p);
              setApplied(
                t('workshop.applied', {
                  effects: p.effects.length,
                  functions: p.functions.length,
                  npcs: p.npcCode.length,
                  rules: p.rules.length,
                }),
              );
            }}
          >
            {t('workshop.apply')}
          </button>
        </div>
      </aside>
    </>
  );
}
