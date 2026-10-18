import { create } from 'zustand';

/** Feed-wide playback preferences. */
export const usePlayer = create<{ muted: boolean; toggleMuted(): void }>((set) => ({
  muted: false,
  toggleMuted: () => set((s) => ({ muted: !s.muted })),
}));
