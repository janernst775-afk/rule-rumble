import { useEffect, useId, useRef, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { CloseIcon } from './Icons';

interface Props {
  title: string;
  onClose?: () => void;
  children: ReactNode;
  width?: number;
}

/** Modal dialog with focus on open and Escape to close. */
export function Dialog({ title, onClose, children, width = 420 }: Props) {
  const { t } = useTranslation();
  const id = useId();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    el?.querySelector<HTMLElement>('button, input, select, [tabindex]')?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && onClose) {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <div
        ref={ref}
        className="card dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={id}
        style={{ width }}
      >
        <div className="dialog-head">
          <h2 id={id}>{title}</h2>
          {onClose && (
            <button
              type="button"
              className="icon-btn icon-btn-small"
              onClick={onClose}
              aria-label={t('common.close')}
            >
              <CloseIcon size={18} />
            </button>
          )}
        </div>
        {children}
      </div>
    </div>
  );
}
