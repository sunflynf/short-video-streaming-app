import type { UserSummary } from '@app/shared';
import { Image } from 'expo-image';
import { StyleSheet, Text, View } from 'react-native';
import { colors } from '../lib/theme';

export function Avatar({ user, size = 40 }: { user: UserSummary; size?: number }) {
  const style = { width: size, height: size, borderRadius: size / 2 };
  if (user.avatarUrl) {
    return <Image source={user.avatarUrl} style={[styles.base, style]} contentFit="cover" />;
  }
  const initial = (user.displayName || user.username).charAt(0).toUpperCase();
  return (
    <View style={[styles.base, styles.fallback, style]}>
      <Text style={[styles.initial, { fontSize: size * 0.42 }]}>{initial}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  base: { backgroundColor: colors.surface },
  fallback: { alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accent },
  initial: { color: '#fff', fontWeight: '700' },
});
