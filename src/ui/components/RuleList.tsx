import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { EffectKind, RuleDefinition, TriggerKind } from '../../lang/ast';
import {
  EFFECT_KINDS,
  TRIGGER_KINDS,
  effectKinds,
  ruleDescription,
  spawnsNpcs,
  usesRandom,
} from '../ruleText';

interface Props {
  rules: RuleDefinition[];
  selectedId: string | null;
  onSelect: (def: RuleDefinition) => void;
  /** i18n reason why a rule cannot be used right now, or null. */
  disabledReason?: (def: RuleDefinition) => string | null;
  onRemove?: (def: RuleDefinition) => void;
}

/** Searchable, filterable list of rules (SPEC 5.5). */
export function RuleList({ rules, selectedId, onSelect, disabledReason, onRemove }: Props) {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const [trigger, setTrigger] = useState<TriggerKind | ''>('');
  const [effect, setEffect] = useState<EffectKind | ''>('');

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rules.filter(
      (r) =>
        (!q || r.ast.name.toLowerCase().includes(q)) &&
        (!trigger || r.ast.trigger.kind === trigger) &&
        (!effect || effectKinds(r).includes(effect)),
    );
  }, [rules, query, trigger, effect]);

  return (
    <div className="rule-list">
      <div className="rule-filters">
        <input
          className="input input-soft input-small"
          type="search"
          placeholder={t('rules.search')}
          aria-label={t('rules.search')}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <select
          className="mini-select"
          aria-label={t('rules.filterTrigger')}
          value={trigger}
          onChange={(e) => setTrigger(e.target.value as TriggerKind | '')}
        >
          <option value="">{t('rules.allTriggers')}</option>
          {TRIGGER_KINDS.map((k) => (
            <option key={k} value={k}>
              {t(`ruleText.triggers.${k}`)}
            </option>
          ))}
        </select>
        <select
          className="mini-select"
          aria-label={t('rules.filterEffect')}
          value={effect}
          onChange={(e) => setEffect(e.target.value as EffectKind | '')}
        >
          <option value="">{t('rules.allEffects')}</option>
          {EFFECT_KINDS.map((k) => (
            <option key={k} value={k}>
              {t(`ruleText.effects.${k}`)}
            </option>
          ))}
        </select>
      </div>
      {visible.length === 0 && <p className="hint">{t('rules.noMatch')}</p>}
      <ul className="rule-options">
        {visible.map((def) => {
          const reason = disabledReason?.(def) ?? null;
          return (
            <li key={def.id}>
              <button
                type="button"
                className={`rule-option${selectedId === def.id ? ' is-selected' : ''}`}
                aria-pressed={selectedId === def.id}
                disabled={reason !== null}
                title={reason ? t(reason) : undefined}
                onClick={() => onSelect(def)}
              >
                <span className="rule-option-head">
                  <strong>{def.ast.name}</strong>
                  <span className="rule-tags">
                    {usesRandom(def) && <span className="tag">{t('rules.tagRandom')}</span>}
                    {spawnsNpcs(def) && <span className="tag">{t('rules.tagNpc')}</span>}
                    {def.ast.duration !== null && (
                      <span className="tag">
                        {t('rules.tagDuration', { count: def.ast.duration })}
                      </span>
                    )}
                  </span>
                </span>
                <span className="rule-option-desc">{ruleDescription(def, t)}</span>
                <span className="rule-option-author">
                  {t('rules.by', { author: def.author })}
                  {reason && <em> · {t(reason)}</em>}
                </span>
              </button>
              {onRemove && !def.id.startsWith('start.') && (
                <button
                  type="button"
                  className="mini-btn rule-remove"
                  onClick={() => onRemove(def)}
                >
                  {t('rules.remove')}
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
