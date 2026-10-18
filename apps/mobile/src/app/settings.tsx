import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { showSheet } from '../components/ActionSheet';
import { Field, FormError, PrimaryButton } from '../components/Form';
import { errorMessage } from '../components/States';
import { openLegal } from '../lib/links';
import { colors } from '../lib/theme';
import { useDeleteAccount } from '../services/queries/moderation';
import { useAuth } from '../store/auth';

export default function Settings() {
  const signOut = useAuth((s) => s.signOut);
  const remove = useDeleteAccount();
  const [password, setPassword] = useState('');

  const confirmDelete = () =>
    showSheet({
      title: 'Delete your account?',
      message:
        'Your profile, videos, comments and likes are removed permanently. This can’t be undone.',
      options: [
        { label: 'Delete my account', destructive: true, onPress: () => remove.mutate(password) },
      ],
    });

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView style={styles.flex} contentContainerStyle={styles.content}>
        <View style={styles.group}>
          <Row label="Terms of Service" onPress={() => openLegal('terms')} />
          <Row label="Privacy Policy" onPress={() => openLegal('privacy')} />
          <Row label="Log out" onPress={() => void signOut()} />
        </View>

        <View style={styles.danger}>
          <Text style={styles.heading}>Delete account</Text>
          <Text style={styles.note}>
            Enter your password to permanently delete your account and everything you’ve posted.
          </Text>
          <Field
            label="Current password"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoComplete="current-password"
          />
          <FormError message={remove.isError ? errorMessage(remove.error) : null} />
          <PrimaryButton
            title="Delete account"
            variant="danger"
            disabled={!password}
            loading={remove.isPending}
            onPress={confirmDelete}
          />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Row({ label, onPress }: { label: string; onPress(): void }) {
  return (
    <Pressable style={styles.row} onPress={onPress} accessibilityRole="button">
      <Text style={styles.rowText}>{label}</Text>
      <Ionicons name="chevron-forward" size={18} color={colors.muted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, gap: 28 },
  group: { borderRadius: 12, backgroundColor: colors.surface, overflow: 'hidden' },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  rowText: { fontSize: 16, color: colors.text },
  danger: { gap: 12 },
  heading: { fontSize: 17, fontWeight: '700', color: colors.danger },
  note: { color: colors.muted, fontSize: 14 },
});
