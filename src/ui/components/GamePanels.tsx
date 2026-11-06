import { useTranslation } from 'react-i18next';
import type { GameState } from '../../engine/types';
import { usePrefs } from '../../store/prefsStore';
import { displayParams } from '../gameUi';
import { Avatar } from './Avatar';
import { ChevronIcon, HeartIcon } from './Icons';

export function PlayersPanel({ state }: { state: GameState }) {
  const { t } = useTranslation();
  const open = usePrefs((s) => s.leftPanelOpen);
  const setOpen = usePrefs((s) => s.setLeftPanelOpen);
  const currentId = state.turn.order[state.turn.index];
  const ids = [
    ...state.seatOrder,
    ...Object.keys(state.figures).filter((id) => !state.seatOrder.includes(id)),
  ];

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
      <p className="hint rules-empty">{t('game.noRules')}</p>
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
