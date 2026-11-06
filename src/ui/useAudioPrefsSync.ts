import { useEffect } from 'react';
import { setVolumes, unlockAudio } from '../audio/audio';
import { usePrefs } from '../store/prefsStore';

/** Keeps the audio engine in sync with the stored volume preferences. */
export function useAudioPrefsSync(): void {
  const { musicVolume, sfxVolume, muted } = usePrefs();
  useEffect(() => {
    setVolumes({ music: musicVolume, sfx: sfxVolume, muted });
  }, [musicVolume, sfxVolume, muted]);
  useEffect(() => {
    const unlock = () => unlockAudio();
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
  }, []);
}
