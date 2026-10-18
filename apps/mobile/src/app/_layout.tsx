import { Sentry, sentryEnabled, setSentryUser } from '../lib/sentry';
import {
  MutationCache,
  QueryCache,
  QueryClient,
  QueryClientProvider,
  focusManager,
} from '@tanstack/react-query';
import { SplashScreen, Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { Alert, AppState, Platform } from 'react-native';
import { ActionSheetHost } from '../components/ActionSheet';
import { identify } from '../lib/analytics';
import { ApiRequestError } from '../services/api';
import { useAuth } from '../store/auth';

void SplashScreen.preventAutoHideAsync();

// Let TanStack Query know when the app is foregrounded, so stale data refreshes and polling pauses.
if (Platform.OS !== 'web') {
  AppState.addEventListener('change', (state) => focusManager.setFocused(state === 'active'));
}

let lastRateLimitAlert = 0;

/** One friendly message for any 429, at most every 10 s, instead of a cascade of errors. */
function onApiError(err: unknown) {
  if (!(err instanceof ApiRequestError) || err.status !== 429) return;
  if (Date.now() - lastRateLimitAlert < 10_000) return;
  lastRateLimitAlert = Date.now();
  Alert.alert('Slow down a little', 'You’re doing that too often. Please try again in a minute.');
}

const createQueryClient = () =>
  new QueryClient({
    queryCache: new QueryCache({ onError: onApiError }),
    mutationCache: new MutationCache({ onError: onApiError }),
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        // 4xx answers won't change on retry.
        retry: (count, err) => !(err instanceof ApiRequestError && err.status < 500) && count < 2,
      },
    },
  });

function RootLayout() {
  const [queryClient] = useState(createQueryClient);
  const { hydrated, session, hydrate } = useAuth();
  const userId = session?.user.id;

  useEffect(() => {
    void hydrate().finally(() => void SplashScreen.hideAsync());
  }, [hydrate]);

  // Never show one account's cached data to another.
  useEffect(() => {
    queryClient.clear();
    setSentryUser(userId);
    identify(userId);
  }, [queryClient, userId]);

  if (!hydrated) return null;

  return (
    <QueryClientProvider client={queryClient}>
      <StatusBar style="auto" />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Protected guard={!!session}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="user/[id]/index" options={{ headerShown: true, title: '' }} />
          <Stack.Screen name="user/[id]/feed" />
          <Stack.Screen name="video/[id]" />
          <Stack.Screen
            name="comments/[videoId]"
            options={{
              presentation: 'formSheet',
              sheetAllowedDetents: [0.75, 1],
              headerShown: true,
              title: 'Comments',
            }}
          />
          <Stack.Screen
            name="edit-profile"
            options={{ presentation: 'modal', headerShown: true, title: 'Edit profile' }}
          />
          <Stack.Screen name="settings" options={{ headerShown: true, title: 'Settings' }} />
        </Stack.Protected>
        <Stack.Protected guard={!session}>
          <Stack.Screen name="(auth)" />
        </Stack.Protected>
      </Stack>
      <ActionSheetHost />
    </QueryClientProvider>
  );
}

export default sentryEnabled ? Sentry.wrap(RootLayout) : RootLayout;
