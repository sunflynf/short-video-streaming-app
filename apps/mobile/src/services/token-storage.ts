import * as SecureStore from 'expo-secure-store';

const KEY = 'shortvid.session';

/** Persists the session (tokens + profile) in the device keychain / keystore. */
export const tokenStorage = {
  get: () => SecureStore.getItemAsync(KEY),
  set: (value: string) => SecureStore.setItemAsync(KEY, value),
  clear: () => SecureStore.deleteItemAsync(KEY),
};
