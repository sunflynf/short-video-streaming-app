import type { AuthResponse } from '@app/shared';
import { useAuth } from './auth';

const mockStore = new Map<string, string>();
jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(async (k: string) => mockStore.get(k) ?? null),
  setItemAsync: jest.fn(async (k: string, v: string) => void mockStore.set(k, v)),
  deleteItemAsync: jest.fn(async (k: string) => void mockStore.delete(k)),
}));

const auth: AuthResponse = {
  accessToken: 'a1',
  refreshToken: 'r1',
  user: {
    id: 'u1',
    username: 'ann',
    displayName: null,
    avatarUrl: null,
    bio: null,
    followerCount: 0,
    followingCount: 0,
    videoCount: 0,
    isFollowing: null,
    createdAt: '2026-10-18T00:00:00.000Z',
    email: 'ann@example.com',
    role: 'USER',
  },
};

describe('auth store', () => {
  beforeEach(() => {
    mockStore.clear();
    useAuth.setState({ session: null, hydrated: false });
    globalThis.fetch = jest.fn().mockResolvedValue({ ok: true, status: 204, text: async () => '' });
  });

  it('hydrates an empty session', async () => {
    await useAuth.getState().hydrate();
    expect(useAuth.getState()).toMatchObject({ hydrated: true, session: null });
  });

  it('persists the session on sign in and restores it on the next launch', async () => {
    await useAuth.getState().signIn(auth);
    useAuth.setState({ session: null, hydrated: false });
    await useAuth.getState().hydrate();
    expect(useAuth.getState().session).toMatchObject({ accessToken: 'a1', user: { id: 'u1' } });
  });

  it('clears storage and revokes the refresh token on sign out', async () => {
    await useAuth.getState().signIn(auth);
    await useAuth.getState().signOut();
    expect(useAuth.getState().session).toBeNull();
    expect(mockStore.size).toBe(0);
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'http://localhost:3000/v1/auth/logout',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ refreshToken: 'r1' }) }),
    );
  });

  it('survives corrupt stored data', async () => {
    mockStore.set('shortvid.session', '{not json');
    await useAuth.getState().hydrate();
    expect(useAuth.getState()).toMatchObject({ hydrated: true, session: null });
  });
});
