const KEY = 'shortvid.session';

/** Web has no keychain; localStorage is used for the web build (development and testing only). */
export const tokenStorage = {
  get: async () => globalThis.localStorage?.getItem(KEY) ?? null,
  set: async (value: string) => globalThis.localStorage?.setItem(KEY, value),
  clear: async () => globalThis.localStorage?.removeItem(KEY),
};
