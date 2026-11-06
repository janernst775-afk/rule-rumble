import { useTranslation } from 'react-i18next';
import { playSfx } from '../../audio/audio';
import { usePrefs } from '../../store/prefsStore';
import { MuteIcon, SpeakerIcon } from './Icons';

export function MuteButton() {
  const { t } = useTranslation();
  const muted = usePrefs((s) => s.muted);
  const toggle = usePrefs((s) => s.toggleMuted);
  return (
    <button
      type="button"
      className="icon-btn"
      aria-pressed={muted}
      aria-label={muted ? t('audio.unmute') : t('audio.mute')}
      title={muted ? t('audio.unmute') : t('audio.mute')}
      onClick={() => {
        toggle();
        playSfx('click');
      }}
    >
      {muted ? <MuteIcon /> : <SpeakerIcon />}
    </button>
  );
}

export function VolumeSliders() {
  const { t } = useTranslation();
  const { musicVolume, sfxVolume, setMusicVolume, setSfxVolume } = usePrefs();
  return (
    <div className="volume-sliders">
      <label>
        <span className="label">{t('audio.music')}</span>
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={musicVolume}
          onChange={(e) => setMusicVolume(Number(e.target.value))}
        />
      </label>
      <label>
        <span className="label">{t('audio.effects')}</span>
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={sfxVolume}
          onChange={(e) => setSfxVolume(Number(e.target.value))}
          onPointerUp={() => playSfx('click')}
        />
      </label>
    </div>
  );
}
