import type { HealthResponse } from '@app/shared';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { getHealth } from '@/services/api';

type State =
  { kind: 'loading' } | { kind: 'ok'; health: HealthResponse } | { kind: 'error'; message: string };

export default function HomeScreen() {
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    getHealth()
      .then((health) => !cancelled && setState({ kind: 'ok', health }))
      .catch(
        (err: unknown) =>
          !cancelled &&
          setState({ kind: 'error', message: err instanceof Error ? err.message : String(err) }),
      );
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  const retry = () => {
    setState({ kind: 'loading' });
    setAttempt((n) => n + 1);
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>ShortVid</Text>
      {state.kind === 'loading' && <ActivityIndicator />}
      {state.kind === 'ok' && (
        <Text style={styles.body}>
          API {state.health.status} · db {state.health.db} · redis {state.health.redis}
        </Text>
      )}
      {state.kind === 'error' && <Text style={styles.error}>API unreachable: {state.message}</Text>}
      <Pressable onPress={retry} style={styles.button}>
        <Text style={styles.buttonText}>Retry</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24 },
  title: { fontSize: 28, fontWeight: '700' },
  body: { fontSize: 16 },
  error: { fontSize: 16, color: '#c62828', textAlign: 'center' },
  button: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#208AEF',
  },
  buttonText: { color: '#fff', fontWeight: '600' },
});
