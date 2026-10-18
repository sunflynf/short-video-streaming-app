import type { AuthResponse, MeProfile } from '@app/shared';
import { create } from 'zustand';
import { apiFetch, configureSession } from '../services/api';
import { tokenStorage } from '../services/token-storage';

type Session = { accessToken: string; refreshToken: string; user: MeProfile };

type AuthState = {
  /** False until the stored session has been read on startup. */
  hydrated: boolean;
  session: Session | null;
  hydrate(): Promise<void>;
  signIn(auth: AuthResponse): Promise<void>;
  signOut(): Promise<void>;
  setUser(user: MeProfile): void;
};

export const useAuth = create<AuthState>((set, get) => ({
  hydrated: false,
  session: null,

  async hydrate() {
    let session: Session | null = null;
    try {
      const raw = await tokenStorage.get();
      session = raw ? (JSON.parse(raw) as Session) : null;
    } catch {
      session = null;
    }
    set({ session, hydrated: true });
  },

  async signIn(auth) {
    const session = {
      accessToken: auth.accessToken,
      refreshToken: auth.refreshToken,
      user: auth.user,
    };
    set({ session });
    await tokenStorage.set(JSON.stringify(session));
  },

  async signOut() {
    const refreshToken = get().session?.refreshToken;
    if (refreshToken) {
      // Best effort: the local sign-out shouldn't wait on, or fail with, the network.
      apiFetch('/auth/logout', { method: 'POST', body: { refreshToken } }).catch(() => {});
    }
    set({ session: null });
    await tokenStorage.clear();
  },

  setUser(user) {
    const session = get().session;
    if (!session) return;
    const next = { ...session, user };
    set({ session: next });
    void tokenStorage.set(JSON.stringify(next));
  },
}));

configureSession({
  getAccessToken: () => useAuth.getState().session?.accessToken,
  getRefreshToken: () => useAuth.getState().session?.refreshToken,
  onRefreshed: (auth) => void useAuth.getState().signIn(auth),
  onSessionExpired: () => clearLocalSession(),
});

/** Forget the session on this device without calling the API (expired or deleted account). */
export function clearLocalSession(): void {
  useAuth.setState({ session: null });
  void tokenStorage.clear();
}

export const useMe = () => useAuth((s) => s.session?.user);
