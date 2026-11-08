import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Dialog } from './Dialog';

/** Steps of the "So geht's" tutorial; texts in i18n under tutorial.<step>. */
const STEPS = ['goal', 'turn', 'attack', 'board', 'rules', 'workshop', 'keys'] as const;
const ICONS: Record<(typeof STEPS)[number], string> = {
  goal: '👑',
  turn: '👣',
  attack: '🎯',
  board: '🧩',
  rules: '📜',
  workshop: '🛠️',
  keys: '⌨️',
};

/** "So geht's" (v0.8): a short step-by-step introduction. */
export function TutorialDialog({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const [i, setI] = useState(0);
  const step = STEPS[i] ?? 'goal';
  const last = i === STEPS.length - 1;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') setI((x) => Math.min(STEPS.length - 1, x + 1));
      if (e.key === 'ArrowLeft') setI((x) => Math.max(0, x - 1));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <Dialog title={t('tutorial.title')} onClose={onClose} width={560}>
      <div className="tutorial">
        <div className="tutorial-icon" aria-hidden="true">
          {ICONS[step]}
        </div>
        <h3 aria-live="polite">{t(`tutorial.${step}.title`)}</h3>
        <p>{t(`tutorial.${step}.text`)}</p>
        <div className="tutorial-dots" role="group" aria-label={t('tutorial.progress')}>
          {STEPS.map((s, j) => (
            <button
              key={s}
              type="button"
              className="tutorial-dot"
              aria-label={t('tutorial.goTo', { n: j + 1, total: STEPS.length })}
              aria-current={j === i ? 'step' : undefined}
              onClick={() => setI(j)}
            />
          ))}
        </div>
        <div className="dialog-actions">
          <button
            type="button"
            className="btn btn-soft"
            disabled={i === 0}
            onClick={() => setI((x) => x - 1)}
          >
            {t('tutorial.back')}
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => (last ? onClose() : setI((x) => x + 1))}
          >
            {last ? t('tutorial.done') : t('tutorial.next')}
          </button>
        </div>
      </div>
    </Dialog>
  );
}
