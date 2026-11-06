import { create } from 'zustand';
import type { TemplateId } from '../engine/settings';
import type { Settings } from '../engine/types';
import * as L from '../lobby/lobby';

export type Screen = 'start' | 'lobby' | 'game' | 'result';

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** UI-side random lobby code (display only until online play exists). */
export function randomLobbyCode(): string {
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
    if (i === 2) code += '-';
  }
  return code;
}

interface AppState {
  screen: Screen;
  lobby: L.Lobby | null;
  setScreen: (screen: Screen) => void;
  openLobby: (host: L.HostProfile) => void;
  updateLobby: (fn: (lobby: L.Lobby) => L.Lobby) => void;
  syncHost: (host: L.HostProfile) => void;
  applyTemplate: (id: TemplateId) => void;
  applyCustomTemplate: (settings: Settings) => void;
}

export const useApp = create<AppState>()((set, get) => ({
  screen: 'start',
  lobby: null,
  setScreen: (screen) => set({ screen }),
  openLobby: (host) => {
    const existing = get().lobby;
    if (existing) {
      get().syncHost(host);
      set({ screen: 'lobby' });
      return;
    }
    set({ lobby: L.createLobby(host, randomLobbyCode()), screen: 'lobby' });
  },
  updateLobby: (fn) => {
    const lobby = get().lobby;
    if (lobby) set({ lobby: fn(lobby) });
  },
  syncHost: (host) => {
    const lobby = get().lobby;
    if (!lobby) return;
    set({
      lobby: {
        ...lobby,
        seats: lobby.seats.map((s) =>
          s.isHost
            ? {
                ...s,
                name: host.name,
                avatar: {
                  image: host.avatar.image,
                  color: s.role === 'boss' ? L.BOSS_COLOR : host.avatar.color,
                },
              }
            : s,
        ),
      },
    });
  },
  applyTemplate: (id) => get().updateLobby((l) => L.applyTemplate(l, id)),
  applyCustomTemplate: (settings) =>
    get().updateLobby((l) => ({
      ...l,
      settings: structuredClone(settings),
      baseTemplate: 'custom',
    })),
}));
