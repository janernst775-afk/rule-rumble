import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Avatar } from '../engine/types';
import { HERO_COLORS } from '../lobby/lobby';
import { jsonStorage } from './storage';

export interface ProfileState {
  name: string;
  avatar: Avatar;
  setName: (name: string) => void;
  setAvatar: (avatar: Avatar) => void;
}

export const useProfile = create<ProfileState>()(
  persist(
    (set) => ({
      name: '',
      avatar: { image: null, color: HERO_COLORS[0] },
      setName: (name) => set({ name: name.slice(0, 20) }),
      setAvatar: (avatar) => set({ avatar }),
    }),
    { name: 'rr.profile', storage: jsonStorage },
  ),
);
