import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { SETTINGS_LIMITS as L, sanitizeSettings } from '../../engine/settings';
import type { Settings } from '../../engine/types';
import { ChevronIcon } from './Icons';
import { Segmented, SettingRow, Stepper, Toggle } from './Controls';

interface GroupProps {
  title: string;
  defaultOpen?: boolean;
  children: ReactNode;
}

function Group({ title, defaultOpen = false, children }: GroupProps) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="settings-group">
      <h3>
        <button
          type="button"
          className="group-head"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
        >
          <span>{title}</span>
          <ChevronIcon dir={open ? 'up' : 'down'} size={18} />
        </button>
      </h3>
      {open && <div className="group-body">{children}</div>}
    </section>
  );
}

interface Props {
  settings: Settings;
  onChange: (s: Settings) => void;
}

/** "Eigene Einstellungen" (SPEC 2.2). Values that only take effect later are shown but disabled. */
export function SettingsPanel({ settings, onChange }: Props) {
  const { t } = useTranslation();
  const v06 = t('common.fromVersion', { version: 'v0.6' });

  const update = (fn: (s: Settings) => void) => {
    const next = structuredClone(settings);
    fn(next);
    onChange(sanitizeSettings(next));
  };
  const pct = (v: number) => t('settings.percent', { count: v });
  const s = settings;

  return (
    <div className="settings-columns">
      <div className="settings-col">
        <Group title={t('settings.groups.rules')} defaultOpen>
          <SettingRow label={t('settings.maxActive')}>
            <Stepper
              label={t('settings.maxActive')}
              value={s.rules.maxActive ?? L.maxActiveRules.max + 1}
              min={L.maxActiveRules.min}
              max={L.maxActiveRules.max + 1}
              format={(v) => (v > L.maxActiveRules.max ? '∞' : String(v))}
              onChange={(v) =>
                update((x) => (x.rules.maxActive = v > L.maxActiveRules.max ? null : v))
              }
            />
          </SettingRow>
          <SettingRow label={t('settings.overflow')} stacked>
            <Segmented
              label={t('settings.overflow')}
              value={s.rules.overflow}
              options={(['dropOldest', 'authorChooses', 'blockNew', 'vote'] as const).map((o) => ({
                value: o,
                label: t(`settings.overflowOptions.${o}`),
              }))}
              onChange={(v) => update((x) => (x.rules.overflow = v))}
            />
          </SettingRow>
          <SettingRow label={t('settings.activationDelay')}>
            <Segmented
              label={t('settings.activationDelay')}
              value={s.rules.activationDelay}
              options={([0, 1, 2] as const).map((o) => ({
                value: o,
                label: t(`settings.activationOptions.${o}`),
              }))}
              onChange={(v) => update((x) => (x.rules.activationDelay = v))}
            />
          </SettingRow>
          <SettingRow label={t('settings.proCode')} badge={v06} disabled>
            <Toggle
              label={t('settings.proCode')}
              checked={s.rules.proCodeAllowed}
              onChange={(v) => update((x) => (x.rules.proCodeAllowed = v))}
              disabled
            />
          </SettingRow>
          <SettingRow label={t('settings.ruleDamage')}>
            <Stepper
              label={t('settings.ruleDamage')}
              value={s.rules.ruleDamagePerFigurePerRound}
              min={L.ruleDamagePerFigurePerRound.min}
              max={L.ruleDamagePerFigurePerRound.max}
              onChange={(v) => update((x) => (x.rules.ruleDamagePerFigurePerRound = v))}
            />
          </SettingRow>
          <SettingRow label={t('settings.allowRandom')}>
            <Toggle
              label={t('settings.allowRandom')}
              checked={s.rules.allowRandom}
              onChange={(v) => update((x) => (x.rules.allowRandom = v))}
            />
          </SettingRow>
        </Group>

        <Group title={t('settings.groups.board')} defaultOpen>
          <SettingRow label={t('settings.startSize')}>
            <Stepper
              label={t('settings.startSize')}
              value={s.board.startSize}
              min={L.startSize.min}
              max={L.startSize.max}
              format={(v) => `${v} × ${v}`}
              onChange={(v) => update((x) => (x.board.startSize = v))}
            />
          </SettingRow>
          <SettingRow label={t('settings.minTiles')}>
            <Stepper
              label={t('settings.minTiles')}
              value={s.board.minTiles}
              min={L.tiles.min}
              max={L.tiles.max}
              onChange={(v) => update((x) => (x.board.minTiles = v))}
            />
          </SettingRow>
          <SettingRow label={t('settings.maxTiles')}>
            <Stepper
              label={t('settings.maxTiles')}
              value={s.board.maxTiles}
              min={L.tiles.min}
              max={L.tiles.max}
              step={5}
              onChange={(v) => update((x) => (x.board.maxTiles = v))}
            />
          </SettingRow>
          <SettingRow label={t('settings.customTextures')}>
            <Toggle
              label={t('settings.customTextures')}
              checked={s.board.customTextures}
              onChange={(v) => update((x) => (x.board.customTextures = v))}
            />
          </SettingRow>
          <SettingRow label={t('settings.tileActions')}>
            <Segmented
              label={t('settings.tileActions')}
              value={s.board.tileActionsPerAction}
              options={([1, 2] as const).map((o) => ({ value: o, label: `${o}×` }))}
              onChange={(v) => update((x) => (x.board.tileActionsPerAction = v))}
            />
          </SettingRow>
        </Group>
      </div>

      <div className="settings-col">
        <Group title={t('settings.groups.figures')} defaultOpen>
          <SettingRow label={t('settings.heroHp')}>
            <Stepper
              label={t('settings.heroHp')}
              value={s.figures.heroHp}
              min={L.heroHp.min}
              max={L.heroHp.max}
              onChange={(v) => update((x) => (x.figures.heroHp = v))}
            />
          </SettingRow>
          <SettingRow label={t('settings.bossHp')}>
            <Segmented
              label={t('settings.bossHp')}
              value={s.figures.bossHp.mode}
              options={(['perHero', 'fixed'] as const).map((o) => ({
                value: o,
                label: t(`settings.bossHpModes.${o}`),
              }))}
              onChange={(mode) =>
                update((x) => {
                  x.figures.bossHp =
                    mode === 'fixed' ? { mode, value: 9 } : { mode, perHero: 3, solo: 4 };
                })
              }
            />
          </SettingRow>
          {s.figures.bossHp.mode === 'perHero' ? (
            <>
              <SettingRow label={t('settings.bossHpPerHero')}>
                <Stepper
                  label={t('settings.bossHpPerHero')}
                  value={s.figures.bossHp.perHero}
                  min={L.bossHpPerHero.min}
                  max={L.bossHpPerHero.max}
                  format={(v) => `${v} ×`}
                  onChange={(v) =>
                    update(
                      (x) => x.figures.bossHp.mode === 'perHero' && (x.figures.bossHp.perHero = v),
                    )
                  }
                />
              </SettingRow>
              <SettingRow label={t('settings.bossHpSolo')}>
                <Stepper
                  label={t('settings.bossHpSolo')}
                  value={s.figures.bossHp.solo}
                  min={L.bossHpFixed.min}
                  max={L.bossHpFixed.max}
                  onChange={(v) =>
                    update(
                      (x) => x.figures.bossHp.mode === 'perHero' && (x.figures.bossHp.solo = v),
                    )
                  }
                />
              </SettingRow>
            </>
          ) : (
            <SettingRow label={t('settings.bossHpFixed')}>
              <Stepper
                label={t('settings.bossHpFixed')}
                value={s.figures.bossHp.value}
                min={L.bossHpFixed.min}
                max={L.bossHpFixed.max}
                onChange={(v) =>
                  update((x) => x.figures.bossHp.mode === 'fixed' && (x.figures.bossHp.value = v))
                }
              />
            </SettingRow>
          )}
          <SettingRow label={t('settings.heroMove')}>
            <Stepper
              label={t('settings.heroMove')}
              value={s.figures.heroMove}
              min={L.move.min}
              max={L.move.max}
              onChange={(v) => update((x) => (x.figures.heroMove = v))}
            />
          </SettingRow>
          <SettingRow label={t('settings.bossMove')}>
            <Stepper
              label={t('settings.bossMove')}
              value={s.figures.bossMove}
              min={L.move.min}
              max={L.move.max}
              onChange={(v) => update((x) => (x.figures.bossMove = v))}
            />
          </SettingRow>
          <SettingRow label={t('settings.wheelChance')}>
            <Stepper
              label={t('settings.wheelChance')}
              value={s.combat.wheelChance}
              min={L.wheelChance.min}
              max={L.wheelChance.max}
              step={5}
              format={pct}
              onChange={(v) => update((x) => (x.combat.wheelChance = v))}
            />
          </SettingRow>
          <SettingRow label={t('settings.wheelSpread')}>
            <Stepper
              label={t('settings.wheelSpread')}
              value={s.combat.wheelChanceSpread}
              min={L.wheelChanceSpread.min}
              max={L.wheelChanceSpread.max}
              step={5}
              format={pct}
              onChange={(v) => update((x) => (x.combat.wheelChanceSpread = v))}
            />
          </SettingRow>
          <SettingRow label={t('settings.friendlyFire')}>
            <Toggle
              label={t('settings.friendlyFire')}
              checked={s.combat.friendlyFire}
              onChange={(v) => update((x) => (x.combat.friendlyFire = v))}
            />
          </SettingRow>
          <SettingRow label={t('settings.comeback')}>
            <Toggle
              label={t('settings.comeback')}
              checked={s.combat.comeback}
              onChange={(v) => update((x) => (x.combat.comeback = v))}
            />
          </SettingRow>
        </Group>

        <Group title={t('settings.groups.npcs')}>
          <SettingRow label={t('settings.maxNpcs')}>
            <Stepper
              label={t('settings.maxNpcs')}
              value={s.npcs.maxOnBoard}
              min={L.npcsOnBoard.min}
              max={L.npcsOnBoard.max}
              onChange={(v) => update((x) => (x.npcs.maxOnBoard = v))}
            />
          </SettingRow>
          <SettingRow label={t('settings.spawnsPerRound')}>
            <Stepper
              label={t('settings.spawnsPerRound')}
              value={s.npcs.maxSpawnsPerRound}
              min={L.npcSpawnsPerRound.min}
              max={L.npcSpawnsPerRound.max}
              onChange={(v) => update((x) => (x.npcs.maxSpawnsPerRound = v))}
            />
          </SettingRow>
        </Group>

        <Group title={t('settings.groups.tempo')}>
          <SettingRow label={t('settings.turnTime')}>
            <Stepper
              label={t('settings.turnTime')}
              value={s.tempo.turnTimeSec ?? L.turnTimeSec.max + 15}
              min={L.turnTimeSec.min}
              max={L.turnTimeSec.max + 15}
              step={15}
              format={(v) =>
                v > L.turnTimeSec.max
                  ? t('settings.turnTimeUnlimited')
                  : t('settings.seconds', { count: v })
              }
              onChange={(v) =>
                update((x) => (x.tempo.turnTimeSec = v > L.turnTimeSec.max ? null : v))
              }
            />
          </SettingRow>
          <SettingRow label={t('settings.roundLimit')}>
            <Stepper
              label={t('settings.roundLimit')}
              value={s.tempo.roundLimit?.rounds ?? L.roundLimit.min - 5}
              min={L.roundLimit.min - 5}
              max={L.roundLimit.max}
              step={5}
              format={(v) =>
                v < L.roundLimit.min ? t('common.none') : t('settings.rounds', { count: v })
              }
              onChange={(v) =>
                update((x) => {
                  x.tempo.roundLimit =
                    v < L.roundLimit.min
                      ? null
                      : { rounds: v, outcome: x.tempo.roundLimit?.outcome ?? 'boss' };
                })
              }
            />
          </SettingRow>
          {s.tempo.roundLimit && (
            <SettingRow label={t('settings.roundLimitOutcome')}>
              <Segmented
                label={t('settings.roundLimitOutcome')}
                value={s.tempo.roundLimit.outcome}
                options={(['boss', 'draw'] as const).map((o) => ({
                  value: o,
                  label: t(`settings.roundLimitOutcomes.${o}`),
                }))}
                onChange={(o) =>
                  update((x) => x.tempo.roundLimit && (x.tempo.roundLimit.outcome = o))
                }
              />
            </SettingRow>
          )}
        </Group>

        <Group title={t('settings.groups.bots')}>
          <SettingRow label={t('settings.botSpeed')}>
            <Segmented
              label={t('settings.botSpeed')}
              value={s.bots.speed}
              options={(['fast', 'normal', 'slow'] as const).map((o) => ({
                value: o,
                label: t(`settings.botSpeeds.${o}`),
              }))}
              onChange={(v) => update((x) => (x.bots.speed = v))}
            />
          </SettingRow>
          <SettingRow label={t('settings.heroChaos')}>
            <Stepper
              label={t('settings.heroChaos')}
              value={s.bots.heroChaos}
              min={L.heroChaos.min}
              max={L.heroChaos.max}
              step={5}
              format={pct}
              onChange={(v) => update((x) => (x.bots.heroChaos = v))}
            />
          </SettingRow>
        </Group>
      </div>
    </div>
  );
}
