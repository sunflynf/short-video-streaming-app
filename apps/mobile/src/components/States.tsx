import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors } from '../lib/theme';

export function Loading({ dark }: { dark?: boolean }) {
  return (
    <View style={[styles.center, dark && styles.dark]}>
      <ActivityIndicator color={dark ? '#fff' : colors.accent} />
    </View>
  );
}

export function ErrorView({
  message,
  onRetry,
  dark,
}: {
  message: string;
  onRetry?: () => void;
  dark?: boolean;
}) {
  return (
    <View style={[styles.center, dark && styles.dark]}>
      <Text style={[styles.text, dark && styles.darkText]}>{message}</Text>
      {onRetry && (
        <Pressable onPress={onRetry} style={styles.button} accessibilityRole="button">
          <Text style={styles.buttonText}>Try again</Text>
        </Pressable>
      )}
    </View>
  );
}

export function Empty({ text, dark }: { text: string; dark?: boolean }) {
  return (
    <View style={[styles.center, dark && styles.dark]}>
      <Text style={[styles.text, dark && styles.darkText]}>{text}</Text>
    </View>
  );
}

export const errorMessage = (err: unknown) =>
  err instanceof Error ? err.message : 'Something went wrong';

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24 },
  dark: { backgroundColor: colors.black },
  text: { color: colors.muted, fontSize: 15, textAlign: 'center' },
  darkText: { color: '#ccc' },
  button: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: colors.accent,
  },
  buttonText: { color: '#fff', fontWeight: '600' },
});
