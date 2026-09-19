import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  DEFAULT_SETTINGS,
  type ActionId,
  type Settings,
} from './shortcuts';

interface SettingsState extends Settings {
  setBinding: (action: ActionId, code: string) => void;
  swapBindings: (a: ActionId, b: ActionId) => void;
  setSpeedStep: (v: number) => void;
  setJumpSec: (v: number) => void;
  setRateRange: (min: number, max: number) => void;
  resetDefaults: () => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      ...DEFAULT_SETTINGS,

      setBinding: (action, code) =>
        set((s) => ({ bindings: { ...s.bindings, [action]: code } })),

      swapBindings: (a, b) =>
        set((s) => ({
          bindings: { ...s.bindings, [a]: s.bindings[b], [b]: s.bindings[a] },
        })),

      setSpeedStep: (v) =>
        set({ speedStep: Math.min(1, Math.max(0.05, v)) }),

      setJumpSec: (v) =>
        set({ jumpSec: Math.min(30, Math.max(1, v)) }),

      setRateRange: (min, max) =>
        set({
          minRate: Math.min(4, Math.max(0.1, min)),
          maxRate: Math.min(5, Math.max(min + 0.1, max)),
        }),

      resetDefaults: () => set({ ...DEFAULT_SETTINGS }),
    }),
    { name: 'mv-settings' },
  ),
);
