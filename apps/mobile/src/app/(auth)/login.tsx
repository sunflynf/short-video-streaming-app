import { Link } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, Text, View } from 'react-native';
import { Field, FormError, PrimaryButton } from '../../components/Form';
import { errorMessage } from '../../components/States';
import { colors } from '../../lib/theme';
import { validateCredentials } from '../../lib/validation';
import { useLogin } from '../../services/queries/auth';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [touched, setTouched] = useState(false);
  const login = useLogin();
  const errors = touched ? validateCredentials({ email, password }) : {};

  const submit = () => {
    setTouched(true);
    if (Object.keys(validateCredentials({ email, password })).length) return;
    login.mutate({ email: email.trim(), password });
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.form}>
        <Text style={styles.title}>Welcome back</Text>
        <Field
          label="Email"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          error={errors.email}
        />
        <Field
          label="Password"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoComplete="current-password"
          onSubmitEditing={submit}
          error={errors.password}
        />
        <FormError message={login.isError ? errorMessage(login.error) : null} />
        <PrimaryButton title="Log in" onPress={submit} loading={login.isPending} />
        <Text style={styles.switch}>
          New here?{' '}
          <Link href="/signup" replace style={styles.link}>
            Create an account
          </Link>
        </Text>
      </View>
    </KeyboardAvoidingView>
  );
}

export const authStyles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  form: { padding: 24, gap: 16 },
  title: { fontSize: 28, fontWeight: '800', color: colors.text, marginBottom: 8 },
  switch: { textAlign: 'center', color: colors.muted },
  link: { color: colors.accent, fontWeight: '600' },
});
const styles = authStyles;
