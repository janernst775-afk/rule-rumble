import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ruleSlotsFull } from '../../engine/rules';
import type { GameState } from '../../engine/types';
import type { RuleDefinition } from '../../lang/ast';
import { validateRule } from '../../lang/validator';
import { allRules, useLibrary } from '../../store/libraryStore';
import { ruleDescription } from '../ruleText';
import { Dialog } from './Dialog';
import { withBundle } from '../../engine/rules';
import { allNpcTypes, useWorkshop, withBundleFromWorkshop } from '../../store/workshopStore';
import { RuleList } from './RuleList';

interface Props {
  game: GameState;
  onCancel: () => void;
  onConfirm: (rule: RuleDefinition, replaceRuleId?: string) => void;
  /** Opens the rule editor (null = new rule). */
  onEdit: (rule: RuleDefinition | null) => void;
  /** Library id to select initially (e.g. a rule just saved in the editor). */
  preselectId?: string | undefined;
}

/** Action "Neue Regel": pick a rule from the library or open the rule editor. */
export function RulePicker({ game, onCancel, onConfirm, onEdit, preselectId }: Props) {
  const { t } = useTranslation();
  const own = useLibrary((s) => s.rules);
  const ownEffects = useWorkshop((s) => s.effects);
  const ownNpcs = useWorkshop((s) => s.npcTypes);
  const ownFunctions = useWorkshop((s) => s.functions);
  const [selected, setSelected] = useState<RuleDefinition | null>(
    () => allRules(own).find((r) => r.id === preselectId) ?? null,
  );
  const [replaceId, setReplaceId] = useState<string | null>(null);

  const inGame = new Set(game.rules.map((r) => r.def.id));
  const disabledReason = (def: RuleDefinition): string | null => {
    if (inGame.has(def.id)) return 'rules.alreadyActive';
    // The rule's own effects and NPC types travel with it (from its bundle or the workshop).
    const withOwn = withBundleFromWorkshop(def, ownEffects, allNpcTypes(ownNpcs), ownFunctions);
    const { effects, npcTypes, functions } = withBundle(game, withOwn);
    const errors = validateRule(def.ast, game.settings, npcTypes, effects, functions);
    if (errors.length === 0) return null;
    return `validation.${errors[0]?.code ?? 'invalid'}`;
  };

  const full = ruleSlotsFull(game);
  const overflow = game.settings.rules.overflow;
  const needsReplace = full && overflow === 'authorChooses';
  const activeFrom = game.round + game.settings.rules.activationDelay;
  const canConfirm = selected !== null && (!needsReplace || replaceId !== null);

  return (
    <Dialog title={t('rules.pickTitle')} onClose={onCancel} width={920}>
      <div className="rule-picker">
        <RuleList
          rules={allRules(own)}
          selectedId={selected?.id ?? null}
          onSelect={setSelected}
          disabledReason={disabledReason}
        />
        <aside className="rule-picker-side">
          {selected ? (
            <>
              <h3>{selected.ast.name}</h3>
              <p>{ruleDescription(selected, t)}</p>
            </>
          ) : (
            <p className="hint">{t('rules.pickHint')}</p>
          )}
          <div className="library-actions">
            <button type="button" className="btn btn-small" onClick={() => onEdit(null)}>
              {t('editor.newRuleButton')}
            </button>
            {selected && (
              <button
                type="button"
                className="btn btn-soft btn-small"
                onClick={() => onEdit(selected)}
              >
                {selected.id.startsWith('start.') ? t('editor.editCopy') : t('editor.edit')}
              </button>
            )}
          </div>
          <p className="fair-note">
            {activeFrom <= game.round
              ? t('rules.fairNow')
              : t('rules.fairNext', { round: activeFrom })}
          </p>
          {full && overflow === 'dropOldest' && <p className="hint">{t('rules.overflowDrop')}</p>}
          {full && overflow === 'vote' && <p className="hint">{t('rules.overflowVote')}</p>}
          {needsReplace && (
            <fieldset className="replace-choice">
              <legend className="label">{t('rules.chooseReplace')}</legend>
              {game.rules.map((r) => (
                <label key={r.id} className="checkbox">
                  <input
                    type="radio"
                    name="replace"
                    checked={replaceId === r.id}
                    onChange={() => setReplaceId(r.id)}
                  />
                  {r.def.ast.name}
                </label>
              ))}
            </fieldset>
          )}
          <div className="dialog-actions">
            <button type="button" className="btn btn-soft" onClick={onCancel}>
              {t('common.cancel')}
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={!canConfirm}
              onClick={() =>
                selected &&
                onConfirm(
                  withBundleFromWorkshop(selected, ownEffects, allNpcTypes(ownNpcs), ownFunctions),
                  replaceId ?? undefined,
                )
              }
            >
              {t('rules.confirm')}
            </button>
          </div>
        </aside>
      </div>
    </Dialog>
  );
}
