import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { playSfx } from '../../audio/audio';
import { bossHpFor, countChangedValues, TEMPLATE_IDS, TEMPLATES } from '../../engine/settings';
import type { Difficulty } from '../../engine/types';
import * as L from '../../lobby/lobby';
import { useApp } from '../../store/appStore';
import { useGame } from '../../store/gameStore';
import { useTemplates } from '../../store/templatesStore';
import { MuteButton } from '../components/AudioControls';
import { Avatar } from '../components/Avatar';
import { Dialog } from '../components/Dialog';
import { CloseIcon, GearIcon, LinkIcon } from '../components/Icons';
import { SettingsPanel } from '../components/SettingsPanel';

type Tab = 'templates' | 'custom';

const DIFFICULTIES: Difficulty[] = ['easy', 'normal', 'hard'];

function SeatRow({ seat, lobby }: { seat: L.LobbySeat; lobby: L.Lobby }) {
  const { t } = useTranslation();
  const update = useApp((s) => s.updateLobby);
  const heroes = L.heroCount(lobby);
  const bossHp = bossHpFor(lobby.settings, heroes);
  const roleLabel = t(`lobby.roles.${seat.role}`);
  const who = seat.controller === 'human' ? t('lobby.you') : t('lobby.bot');
  const parts = [who, roleLabel];
  if (seat.controller === 'bot' && seat.difficulty)
    parts.push(t(`lobby.difficulties.${seat.difficulty}`));
  if (seat.role === 'boss') parts.push(t('common.lives', { count: bossHp }));

  return (
    <li
      className={`seat${seat.role === 'boss' ? ' seat-boss' : ''}${seat.isHost ? ' seat-host' : ''}`}
    >
      <Avatar name={seat.name} avatar={seat.avatar} size={48} boss={seat.role === 'boss'} />
      <div className="seat-info">
        <strong>{seat.name}</strong>
        <span className="seat-sub">{parts.join(' · ')}</span>
      </div>
      <div className="seat-actions">
        {seat.isHost && <span className="badge-host">{t('lobby.host')}</span>}
        {seat.controller === 'bot' && (
          <select
            className="mini-select"
            aria-label={t('lobby.difficulty')}
            value={seat.difficulty ?? 'normal'}
            onChange={(e) =>
              update((l) => L.updateSeat(l, seat.id, { difficulty: e.target.value as Difficulty }))
            }
          >
            {DIFFICULTIES.map((d) => (
              <option key={d} value={d}>
                {t(`lobby.difficulties.${d}`)}
              </option>
            ))}
          </select>
        )}
        {seat.role === 'hero' ? (
          <button
            type="button"
            className="mini-btn"
            onClick={() => update((l) => L.makeBoss(l, seat.id))}
          >
            {t('lobby.makeBoss')}
          </button>
        ) : (
          heroes < L.MAX_SEATS - 1 &&
          seat.controller === 'human' && (
            <button
              type="button"
              className="mini-btn"
              onClick={() => update((l) => L.makeHero(l, seat.id))}
            >
              {t('lobby.makeHero')}
            </button>
          )
        )}
        {!seat.isHost && (
          <button
            type="button"
            className="mini-icon"
            aria-label={t('lobby.removeSeat', { name: seat.name })}
            title={t('lobby.removeSeat', { name: seat.name })}
            onClick={() => update((l) => L.removeSeat(l, seat.id))}
          >
            <CloseIcon size={16} />
          </button>
        )}
      </div>
    </li>
  );
}

function SaveTemplateDialog({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const lobby = useApp((s) => s.lobby);
  const save = useTemplates((s) => s.save);
  const [name, setName] = useState('');
  if (!lobby) return null;
  return (
    <Dialog title={t('lobby.saveTemplate')} onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!name.trim()) return;
          save(name.trim(), lobby.settings);
          onClose();
        }}
      >
        <label>
          <span className="label">{t('lobby.templateName')}</span>
          <input
            className="input"
            value={name}
            maxLength={30}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <div className="dialog-actions">
          <button type="button" className="btn btn-soft" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button type="submit" className="btn btn-primary" disabled={!name.trim()}>
            {t('common.save')}
          </button>
        </div>
      </form>
    </Dialog>
  );
}

export function LobbyScreen() {
  const { t } = useTranslation();
  const lobby = useApp((s) => s.lobby);
  const update = useApp((s) => s.updateLobby);
  const setScreen = useApp((s) => s.setScreen);
  const applyTemplate = useApp((s) => s.applyTemplate);
  const applyCustom = useApp((s) => s.applyCustomTemplate);
  const startGame = useGame((s) => s.start);
  const saved = useTemplates((s) => s.templates);
  const removeSaved = useTemplates((s) => s.remove);
  const [tab, setTab] = useState<Tab>('templates');
  const [saveOpen, setSaveOpen] = useState(false);

  if (!lobby) return null;

  const error = L.startError(lobby);
  const free = L.MAX_SEATS - lobby.seats.length;
  const baseName =
    lobby.baseTemplate === 'custom'
      ? t('templates.custom.name')
      : t(`templates.${lobby.baseTemplate}.name`);
  const changed =
    lobby.baseTemplate === 'custom'
      ? 0
      : countChangedValues(TEMPLATES[lobby.baseTemplate], lobby.settings);

  const start = () => {
    if (error) return;
    playSfx('click');
    startGame(L.toGameSetup(lobby, Math.floor(Math.random() * 2 ** 31)));
    setScreen('game');
  };

  return (
    <main className="lobby-screen">
      <header className="lobby-header">
        <button
          type="button"
          className="logo-btn"
          onClick={() => setScreen('start')}
          title={t('lobby.back')}
        >
          <span className="title-logo">{t('app.title')}</span>
        </button>
        <div className="lobby-header-right">
          <span className="lobby-code-label">{t('lobby.code')}</span>
          <span className="lobby-code">{lobby.code}</span>
          <MuteButton />
        </div>
      </header>

      <div className="lobby-body">
        <section className="card lobby-players" aria-labelledby="players-title">
          <div className="players-head">
            <h2 id="players-title">{t('lobby.players')}</h2>
            <span className="players-count">
              {lobby.seats.length} / {L.MAX_SEATS}
            </span>
          </div>
          <ul className="seat-list">
            {lobby.seats.map((seat) => (
              <SeatRow key={seat.id} seat={seat} lobby={lobby} />
            ))}
            {Array.from({ length: free }, (_, i) => (
              <li key={`free-${i}`} className="seat seat-free">
                {t('lobby.freeSeat')}
              </li>
            ))}
          </ul>
          <div className="players-foot">
            <div className="players-buttons">
              <button
                type="button"
                className="btn"
                disabled={!L.canAddBot(lobby)}
                onClick={() => {
                  playSfx('click');
                  update((l) => L.addBot(l));
                }}
              >
                {t('lobby.addBot')}
              </button>
              <button type="button" className="btn btn-blue" disabled title={t('lobby.inviteHint')}>
                <LinkIcon size={18} /> {t('lobby.invite')}
              </button>
            </div>
            <p className="hint center">{t('lobby.inviteHint')}</p>
          </div>
        </section>

        <section className="card lobby-settings">
          <div className="settings-tabs">
            <div role="tablist" className="tabs">
              {(['templates', 'custom'] as const).map((id) => (
                <button
                  key={id}
                  role="tab"
                  type="button"
                  aria-selected={tab === id}
                  className="tab"
                  onClick={() => setTab(id)}
                >
                  {id === 'templates' ? t('lobby.templates') : t('lobby.customSettings')}
                </button>
              ))}
            </div>
            <span className="hint">
              {changed > 0
                ? t('lobby.basedOn', { template: baseName, count: changed })
                : t('lobby.basedOnUnchanged', { template: baseName })}
            </span>
          </div>

          <div className="settings-scroll" role="tabpanel">
            {tab === 'templates' ? (
              <>
                <div className="template-grid">
                  {TEMPLATE_IDS.map((id) => (
                    <div
                      key={id}
                      className={`template-card${lobby.baseTemplate === id ? ' is-active' : ''}`}
                    >
                      <button
                        type="button"
                        className="template-main"
                        aria-pressed={lobby.baseTemplate === id}
                        onClick={() => {
                          playSfx('click');
                          applyTemplate(id);
                        }}
                      >
                        <strong>{t(`templates.${id}.name`)}</strong>
                        <span>{t(`templates.${id}.desc`)}</span>
                      </button>
                      <button
                        type="button"
                        className="mini-icon template-gear"
                        aria-label={t('lobby.configureTemplate', {
                          name: t(`templates.${id}.name`),
                        })}
                        title={t('lobby.configureTemplate', { name: t(`templates.${id}.name`) })}
                        onClick={() => {
                          applyTemplate(id);
                          setTab('custom');
                        }}
                      >
                        <GearIcon size={18} />
                      </button>
                    </div>
                  ))}
                </div>
                {saved.length > 0 && (
                  <>
                    <h3 className="subhead">{t('lobby.myTemplates')}</h3>
                    <div className="template-grid">
                      {saved.map((tpl) => (
                        <div key={tpl.id} className="template-card">
                          <button
                            type="button"
                            className="template-main"
                            onClick={() => applyCustom(tpl.settings)}
                          >
                            <strong>{tpl.name}</strong>
                          </button>
                          <button
                            type="button"
                            className="mini-icon template-gear"
                            aria-label={t('lobby.deleteTemplate', { name: tpl.name })}
                            title={t('lobby.deleteTemplate', { name: tpl.name })}
                            onClick={() => removeSaved(tpl.id)}
                          >
                            <CloseIcon size={16} />
                          </button>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </>
            ) : (
              <SettingsPanel
                settings={lobby.settings}
                onChange={(s) => update((l) => L.setSettings(l, s))}
              />
            )}
          </div>

          <div className="settings-foot">
            <span className="estimate">
              {t('common.minutes', { count: L.estimateMinutes(lobby) })}
            </span>
            <button type="button" className="btn btn-soft" onClick={() => setSaveOpen(true)}>
              {t('lobby.saveTemplate')}
            </button>
            <div className="start-wrap">
              {error && (
                <span className="form-error" role="alert">
                  {t(`lobby.error.${error}`)}
                </span>
              )}
              <button
                type="button"
                className="btn btn-primary btn-big btn-start"
                disabled={error !== null}
                onClick={start}
              >
                {t('lobby.start')}
              </button>
            </div>
          </div>
        </section>
      </div>
      {saveOpen && <SaveTemplateDialog onClose={() => setSaveOpen(false)} />}
    </main>
  );
}
