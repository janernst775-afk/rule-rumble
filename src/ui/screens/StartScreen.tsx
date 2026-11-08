import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { playSfx } from '../../audio/audio';
import { HERO_COLORS, BOSS_COLOR } from '../../lobby/lobby';
import { useApp } from '../../store/appStore';
import { useProfile } from '../../store/profileStore';
import { TutorialDialog } from '../components/TutorialDialog';
import { MuteButton } from '../components/AudioControls';
import { Avatar } from '../components/Avatar';
import { ACCEPTED_TYPES, checkImageFile } from '../avatarUtils';
import { AvatarCropDialog } from '../components/AvatarCropDialog';
import { CameraIcon, GearIcon } from '../components/Icons';
import { PrefsDialog } from '../components/PrefsDialog';

const PROFILE_COLORS = [...HERO_COLORS, BOSS_COLOR];

export function StartScreen() {
  const { t } = useTranslation();
  const { name, avatar, setName, setAvatar } = useProfile();
  const openLobby = useApp((s) => s.openLobby);
  const setScreen = useApp((s) => s.setScreen);
  const fileInput = useRef<HTMLInputElement>(null);
  const [cropFile, setCropFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tutorial, setTutorial] = useState(false);
  const [prefsOpen, setPrefsOpen] = useState(false);

  const displayName = name.trim() || t('lobby.roles.hero');

  const onFile = (file: File | undefined) => {
    if (!file) return;
    const problem = checkImageFile(file);
    setError(problem);
    if (!problem) setCropFile(file);
  };

  return (
    <main className="start-screen">
      <div className="top-right">
        <MuteButton />
        <button
          type="button"
          className="icon-btn"
          aria-label={t('start.settings')}
          title={t('start.settings')}
          onClick={() => setPrefsOpen(true)}
        >
          <GearIcon />
        </button>
      </div>

      <header className="start-header">
        <h1 className="title-logo start-logo">{t('app.title')}</h1>
        <p className="start-tagline">{t('app.tagline')}</p>
      </header>

      <section className="card start-card">
        <div className="start-left">
          <div className="start-avatar">
            <Avatar name={displayName} avatar={avatar} size={160} border={5} />
            <button
              type="button"
              className="avatar-upload"
              aria-label={t('start.uploadAvatar')}
              title={t('start.uploadAvatar')}
              onClick={() => fileInput.current?.click()}
            >
              <CameraIcon size={22} />
            </button>
            <input
              ref={fileInput}
              type="file"
              accept={ACCEPTED_TYPES.join(',')}
              className="visually-hidden"
              tabIndex={-1}
              onChange={(e) => {
                onFile(e.target.files?.[0]);
                e.target.value = '';
              }}
            />
          </div>
          {error && (
            <p className="form-error" role="alert">
              {t(error)}
            </p>
          )}
          <div className="color-row" role="group" aria-label={t('start.pickColor', { color: '' })}>
            {PROFILE_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                className="color-dot"
                style={{ background: c }}
                aria-label={t('start.pickColor', { color: c })}
                aria-pressed={!avatar.image && avatar.color.toUpperCase() === c}
                onClick={() => setAvatar({ image: null, color: c })}
              />
            ))}
            {avatar.image && (
              <button
                type="button"
                className="btn btn-soft btn-small"
                onClick={() => setAvatar({ ...avatar, image: null })}
              >
                {t('avatar.remove')}
              </button>
            )}
          </div>
          <label className="start-name">
            <span className="label">{t('start.yourName')}</span>
            <input
              className="input"
              value={name}
              maxLength={20}
              placeholder={t('start.namePlaceholder')}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
        </div>

        <div className="start-divider" aria-hidden="true" />

        <div className="start-right">
          <button
            type="button"
            className="btn btn-primary btn-big"
            onClick={() => {
              playSfx('click');
              openLobby({ name: displayName, avatar });
            }}
          >
            {t('start.createLobby')}
          </button>
          <div className="join-row">
            <input
              className="input input-soft"
              placeholder={t('start.codePlaceholder')}
              disabled
              aria-label={t('start.codePlaceholder')}
            />
            <button type="button" className="btn" disabled title={t('start.joinSoon')}>
              {t('start.join')}
            </button>
          </div>
          <p className="hint center">{t('start.joinSoon')}</p>
          <div className="start-secondary">
            <button type="button" className="btn btn-soft" onClick={() => setTutorial(true)}>
              {t('start.howTo')}
            </button>
            <button type="button" className="btn btn-soft" onClick={() => setScreen('library')}>
              {t('start.library')}
            </button>
          </div>
        </div>
      </section>

      <footer className="start-footer">
        <span>{t('app.footer')}</span>
        <span aria-hidden="true">·</span>
        <span>{t('app.footerPlayers')}</span>
      </footer>

      {cropFile && (
        <AvatarCropDialog
          file={cropFile}
          onCancel={() => setCropFile(null)}
          onDone={(image) => {
            setAvatar({ ...avatar, image });
            setCropFile(null);
          }}
        />
      )}
      {prefsOpen && <PrefsDialog onClose={() => setPrefsOpen(false)} />}
      {tutorial && <TutorialDialog onClose={() => setTutorial(false)} />}
    </main>
  );
}
