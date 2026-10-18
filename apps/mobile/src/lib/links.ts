import { Linking } from 'react-native';

/** Where the API serves share pages and the legal pages (no `/v1` prefix). */
export const WEB_URL = process.env.EXPO_PUBLIC_WEB_URL ?? 'http://localhost:3000';

export const legalUrl = (page: 'terms' | 'privacy') => `${WEB_URL}/legal/${page}`;

export const openLegal = (page: 'terms' | 'privacy') => void Linking.openURL(legalUrl(page));
