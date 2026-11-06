import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Language } from '../i18n';
import { jsonStorage } from './storage';

export interface PrefsState {
  language: Language;
  musicVolume: number;
  sfxVolume: number;
  muted: boolean;
  leftPanelOpen: boolean;
  rightPanelOpen: boolean;
  logOpen: boolean;
  setLanguage: (l: Language) => void;
  setMusicVolume: (v: number) => void;
  setSfxVolume: (v: number) => void;
  toggleMuted: () => void;
  setLeftPanelOpen: (open: boolean) => void;
  setRightPanelOpen: (open: boolean) => void;
  setLogOpen: (open: boolean) => void;
}

export const usePrefs = create<PrefsState>()(
  persist(
    (set) => ({
      language: 'de',
      musicVolume: 0.5,
      sfxVolume: 0.8,
      muted: false,
      leftPanelOpen: true,
      rightPanelOpen: true,
      logOpen: false,
      setLanguage: (language) => set({ language }),
      setMusicVolume: (musicVolume) => set({ musicVolume }),
      setSfxVolume: (sfxVolume) => set({ sfxVolume }),
      toggleMuted: () => set((s) => ({ muted: !s.muted })),
      setLeftPanelOpen: (leftPanelOpen) => set({ leftPanelOpen }),
      setRightPanelOpen: (rightPanelOpen) => set({ rightPanelOpen }),
      setLogOpen: (logOpen) => set({ logOpen }),
    }),
    { name: 'rr.prefs', storage: jsonStorage },
  ),
);
