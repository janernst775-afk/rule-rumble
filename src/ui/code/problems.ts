// Parser and validator errors as editor problems (line + friendly message, SPEC 5.4).
import type { TFunction } from 'i18next';
import type { ParseError } from '../../lang/parser';
import type { ValidationError } from '../../lang/validator';
import type { CodeProblem } from './CodeEditor';

export function parseProblems(errors: readonly ParseError[], t: TFunction): CodeProblem[] {
  return errors.map((e) => {
    let message = t(`parse.${e.code}`, e.params);
    if (e.suggestion) message += ` ${t('editor.didYouMean', { word: e.suggestion })}`;
    return { line: e.line, col: e.col, message };
  });
}

export function validationProblems(
  errors: readonly ValidationError[],
  t: TFunction,
  fallbackLine = 1,
): CodeProblem[] {
  return errors.map((e) => ({
    line: e.line ?? fallbackLine,
    message: t(`validation.${e.code}`, e.params),
  }));
}
