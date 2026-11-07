import { useTranslation } from 'react-i18next';
import type { DebugRun } from '../../bots/debugRun';
import { formatValue } from './formatValue';

interface Props {
  run: DebugRun | null;
  /** Index of the current step; -1 = before the first step. */
  index: number;
  disabled: boolean;
  onStep: () => void;
  onContinue: () => void;
  onRestart: () => void;
}

/** Variables view of the debugger (SPEC 5.8, reference screen 7 "Variablen im Testlauf"). */
export function DebugPanel({ run, index, disabled, onStep, onContinue, onRestart }: Props) {
  const { t, i18n } = useTranslation();
  const num = (n: number) => n.toLocaleString(i18n.language);
  const step = run && index >= 0 ? run.steps[index] : undefined;
  const atEnd = !!run && index >= run.steps.length - 1;
  const locals = step ? Object.entries(step.locals) : [];
  const used = step ? step.steps : 0;
  return (
    <div className="card debug-panel" role="region" aria-label={t('workshop.debug.title')}>
      <h3>{t('workshop.debug.title')}</h3>
      {!run && <p className="hint">{t('workshop.debug.start')}</p>}
      {run && step && (
        <p className="hint" aria-live="polite">
          {t('workshop.debug.progress', { i: index + 1, n: run.steps.length, line: step.line })}
        </p>
      )}
      {run && (
        <>
          <div
            className="budget-bar"
            role="meter"
            aria-label={t('workshop.debug.budget', { used: num(used), max: num(run.budget) })}
            aria-valuemin={0}
            aria-valuemax={run.budget}
            aria-valuenow={used}
          >
            <span style={{ width: `${Math.min(100, (used / run.budget) * 100)}%` }} />
          </div>
          <p className="hint">
            {t('workshop.debug.budget', { used: num(used), max: num(run.budget) })}
          </p>
        </>
      )}
      {run && (
        <dl className="debug-vars">
          {locals.length === 0 && <dd className="hint">{t('workshop.debug.noVars')}</dd>}
          {locals.map(([name, value]) => (
            <div key={name} className="debug-var">
              <dt>{name}</dt>
              <dd>= {formatValue(value, run.state, t)}</dd>
            </div>
          ))}
        </dl>
      )}
      {run && atEnd && (
        <p className={run.aborted ? 'form-error' : 'diag-ok-dark'}>
          {run.aborted
            ? t('workshop.testAborted', { reason: t(`workshop.aborted.${run.aborted}`) })
            : t('workshop.debug.done')}
        </p>
      )}
      <div className="debug-actions">
        <button
          type="button"
          className="btn btn-small"
          disabled={disabled || atEnd}
          onClick={onStep}
        >
          {t('workshop.debug.step')}
        </button>
        <button
          type="button"
          className="btn btn-small"
          disabled={disabled || atEnd}
          onClick={onContinue}
        >
          {t('workshop.debug.continue')}
        </button>
        {run && (
          <button type="button" className="btn btn-soft btn-small" onClick={onRestart}>
            {t('workshop.debug.restart')}
          </button>
        )}
      </div>
    </div>
  );
}
