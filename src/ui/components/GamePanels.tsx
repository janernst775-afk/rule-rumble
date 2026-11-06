import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { GameState } from '../../engine/types';
import { isRuleActive } from '../../engine/rules';
import type { ActiveRule } from '../../engine/types';
import { useGame } from '../../store/gameStore';
import { usePrefs } from '../../store/prefsStore';
import { ruleDescription } from '../ruleText';
import { displayParams } from '../gameUi';
import { Avatar } from './Avatar';
import { ChevronIcon, HeartIcon, PinIcon } from './Icons';

export function PlayersPanel({ state }: { state: GameState }) {
  const { t } = useTranslation();
  const open = usePrefs((s) => s.leftPanelOpen);
  const setOpen = usePrefs((s) => s.setLeftPanelOpen);
  const currentId = state.turn.order[state.turn.index];
  const ids = state.seatOrder;
  const npcs = Object.values(state.figures).filter((f) => f.kind === 'npc' && f.alive);
  const npcGroups = state.npcTypes
    .map((type) => ({ type, count: npcs.filter((n) => n.npcTypeId === type.id).length }))
    .filter((g) => g.count > 0);

  return (
    <aside
      className={`card side-panel left-panel${open ? ' is-open' : ''}`}
      aria-label={t('game.players')}
    >
      <button
        type="button"
        className="panel-toggle"
        aria-expanded={open}
        aria-label={open ? t('game.collapsePlayers') : t('game.expandPlayers')}
        title={open ? t('game.collapsePlayers') : t('game.expandPlayers')}
        onClick={() => setOpen(!open)}
      >
        <ChevronIcon dir={open ? 'left' : 'right'} size={18} />
      </button>
      <ul className="player-list">
        {ids.map((id) => {
          const fig = state.figures[id];
          const p = state.participants[id];
          if (!fig || !p) return null;
          return (
            <li
              key={id}
              className={`player${id === currentId ? ' is-current' : ''}${fig.alive ? '' : ' is-dead'}`}
            >
              <Avatar
                name={p.name}
                avatar={p.avatar}
                size={open ? 44 : 48}
                boss={fig.kind === 'boss'}
                dimmed={!fig.alive}
              />
              {open && (
                <div className="player-info">
                  <strong>{p.name}</strong>
                  <span className="hp-bar" aria-label={t('common.lives', { count: fig.hp })}>
                    <span style={{ width: `${(fig.hp / fig.maxHp) * 100}%` }} />
                  </span>
                </div>
              )}
              <span className="player-hp" aria-hidden={open}>
                {fig.alive ? (
                  <>
                    <HeartIcon size={13} className="heart" /> {fig.hp}
                  </>
                ) : (
                  <span className="dead-label">{t('game.dead')}</span>
                )}
              </span>
            </li>
          );
        })}
      </ul>
      {npcGroups.length > 0 && (
        <ul className="npc-summary" aria-label={t('game.npcs')}>
          {npcGroups.map(({ type, count }) => (
            <li
              key={type.id}
              className={
                npcs.some((n) => n.id === currentId && n.npcTypeId === type.id) ? 'is-current' : ''
              }
              title={`${type.name} × ${count}`}
            >
              <Avatar name={type.symbol} avatar={{ image: null, color: type.color }} size={32} />
              <span>{open ? `${type.name} × ${count}` : count}</span>
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
}

export function RulesPanel({ state }: { state: GameState }) {
  const { t } = useTranslation();
  const open = usePrefs((s) => s.rightPanelOpen);
  const setOpen = usePrefs((s) => s.setRightPanelOpen);
  const logOpen = usePrefs((s) => s.logOpen);
  const setLogOpen = usePrefs((s) => s.setLogOpen);
  const max = state.settings.rules.maxActive;
  const entries = state.log.slice(-60).reverse();
  const pinned = usePrefs((s) => s.pinnedRules);
  const togglePin = usePrefs((s) => s.togglePinnedRule);
  const glow = useGame((s) => s.ruleGlow);

  if (!open) {
    return (
      <aside
        className="card side-panel right-panel is-collapsed"
        aria-label={t('game.activeRules')}
      >
        <button
          type="button"
          className="panel-toggle"
          aria-expanded={false}
          aria-label={t('game.expandRules')}
          title={`${t('game.expandRules')} (R)`}
          onClick={() => setOpen(true)}
        >
          <ChevronIcon dir="left" size={18} />
        </button>
        <span className="collapsed-count">
          {t('game.rulesShort')} {state.rules.length}
        </span>
      </aside>
    );
  }

  return (
    <aside className="card side-panel right-panel is-open" aria-label={t('game.activeRules')}>
      <div className="panel-head">
        <h2>
          {t('game.activeRules')}{' '}
          <span className="pill">
            {state.rules.length} / {max ?? '∞'}
          </span>
        </h2>
        <button
          type="button"
          className="panel-toggle"
          aria-expanded
          aria-label={t('game.collapseRules')}
          title={`${t('game.collapseRules')} (R)`}
          onClick={() => setOpen(false)}
        >
          <ChevronIcon dir="right" size={18} />
        </button>
      </div>
      {state.rules.length === 0 ? (
        <p className="hint rules-empty">{t('game.noRules')}</p>
      ) : (
        <ul className="rule-cards">
          {sortedRules(state, pinned).map((rule) => (
            <RuleCard
              key={`${rule.id}:${glow[rule.id] ?? 0}`}
              state={state}
              rule={rule}
              pinned={pinned.includes(rule.def.id)}
              glowing={(glow[rule.id] ?? 0) > 0}
              onPin={() => togglePin(rule.def.id)}
            />
          ))}
        </ul>
      )}
      <section className={`log-section${logOpen ? ' is-open' : ''}`}>
        <h3>
          <button
            type="button"
            className="group-head"
            aria-expanded={logOpen}
            onClick={() => setLogOpen(!logOpen)}
          >
            <span>
              {t('game.log')} <span className="log-count">{state.log.length}</span>
            </span>
            <ChevronIcon dir={logOpen ? 'up' : 'down'} size={18} />
          </button>
        </h3>
        {logOpen && (
          <ol className="log-list" aria-live="polite">
            {entries.map((e, i) => (
              <li key={state.log.length - i}>
                <span className="log-round">{e.round}</span>{' '}
                {t(e.key, displayParams(state, e.params))}
              </li>
            ))}
          </ol>
        )}
      </section>
    </aside>
  );
}

function sortedRules(state: GameState, pinned: string[]): ActiveRule[] {
  return [...state.rules].sort((a, b) => {
    const pa = pinned.includes(a.def.id) ? 0 : 1;
    const pb = pinned.includes(b.def.id) ? 0 : 1;
    return pa - pb || a.order - b.order;
  });
}

interface RuleCardProps {
  state: GameState;
  rule: ActiveRule;
  pinned: boolean;
  glowing: boolean;
  onPin: () => void;
}

/** One rule in the rules panel: title collapsed, plain text expanded (SPEC 8.1). */
function RuleCard({ state, rule, pinned, glowing, onPin }: RuleCardProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const active = isRuleActive(state, rule);
  const author = state.participants[rule.authorId]?.name ?? rule.def.author;
  const left =
    rule.expiresAfterRound !== null && active ? rule.expiresAfterRound - state.round + 1 : null;
  const classes = ['rule-card'];
  if (!active) classes.push('is-pending');
  if (glowing) classes.push('is-glowing');
  if (open) classes.push('is-open');
  return (
    <li className={classes.join(' ')}>
      <div className="rule-card-head">
        <button
          type="button"
          className="rule-card-toggle"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
        >
          <span className="rule-dot" aria-hidden="true" />
          <strong>{rule.def.ast.name}</strong>
          {!active && (
            <span className="rule-pending">
              {t('rules.fromRound', { round: rule.activeFromRound })}
            </span>
          )}
          <ChevronIcon dir={open ? 'up' : 'down'} size={16} />
        </button>
        <button
          type="button"
          className={`mini-icon pin-btn${pinned ? ' is-pinned' : ''}`}
          aria-pressed={pinned}
          aria-label={pinned ? t('rules.unpin') : t('rules.pin')}
          title={pinned ? t('rules.unpin') : t('rules.pin')}
          onClick={onPin}
        >
          <PinIcon size={16} />
        </button>
      </div>
      {open && (
        <div className="rule-card-body">
          <p>{ruleDescription(rule.def, t)}</p>
          <span className="rule-card-meta">
            {t('rules.addedBy', { author })}
            {left !== null && ` · ${t('rules.roundsLeft', { count: left })}`}
          </span>
        </div>
      )}
    </li>
  );
}
