import { useId, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { MinusIcon, PlusIcon } from './Icons';

interface StepperProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  format?: (v: number) => string;
  onChange: (v: number) => void;
  disabled?: boolean;
}

export function Stepper({
  label,
  value,
  min,
  max,
  step = 1,
  format,
  onChange,
  disabled,
}: StepperProps) {
  const { t } = useTranslation();
  return (
    <div className="stepper" role="group" aria-label={label}>
      <button
        type="button"
        className="stepper-btn"
        aria-label={t('common.decrease', { label })}
        disabled={disabled || value <= min}
        onClick={() => onChange(Math.max(min, value - step))}
      >
        <MinusIcon size={16} />
      </button>
      <output className="stepper-value" aria-live="polite">
        {format ? format(value) : value}
      </output>
      <button
        type="button"
        className="stepper-btn"
        aria-label={t('common.increase', { label })}
        disabled={disabled || value >= max}
        onClick={() => onChange(Math.min(max, value + step))}
      >
        <PlusIcon size={16} />
      </button>
    </div>
  );
}

interface ToggleProps {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}

export function Toggle({ label, checked, onChange, disabled }: ToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      className="toggle"
      disabled={disabled}
      onClick={() => onChange(!checked)}
    >
      <span className="toggle-knob" />
    </button>
  );
}

interface SegmentedProps<T extends string | number> {
  label: string;
  value: T;
  options: { value: T; label: string; disabled?: boolean; title?: string }[];
  onChange: (v: T) => void;
  disabled?: boolean;
}

export function Segmented<T extends string | number>({
  label,
  value,
  options,
  onChange,
  disabled,
}: SegmentedProps<T>) {
  return (
    <div className="segmented" role="group" aria-label={label}>
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          aria-pressed={o.value === value}
          disabled={disabled || o.disabled}
          title={o.title}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

interface RowProps {
  label: string;
  children: ReactNode;
  badge?: string;
  disabled?: boolean;
  stacked?: boolean;
}

/** One settings row: label left, control right; `badge` marks values that only work later. */
export function SettingRow({ label, children, badge, disabled, stacked }: RowProps) {
  const id = useId();
  return (
    <div
      className={`setting-row${stacked ? ' stacked' : ''}${disabled ? ' is-disabled' : ''}`}
      aria-labelledby={id}
    >
      <span id={id} className="setting-label">
        {label}
        {badge && <span className="badge-later">{badge}</span>}
      </span>
      <div className="setting-control">{children}</div>
    </div>
  );
}
