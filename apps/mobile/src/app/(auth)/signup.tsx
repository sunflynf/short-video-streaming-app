import { Link } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Text, View } from 'react-native';
import { Field, FormError, PrimaryButton } from '../../components/Form';
import { errorMessage } from '../../components/States';
import { validateCredentials } from '../../lib/validation';
import { useSignup } from '../../services/queries/auth';
import { authStyles as styles } from './login';

export default function Signup() {
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [touched, setTouched] = useState(false);
  const signup = useSignup();
  const values = { email, username, password };
  const errors = touched ? validateCredentials(values) : {};

  const submit = () => {
    setTouched(true);
    if (Object.keys(validateCredentials(values)).length) return;
    signup.mutate({ email: email.trim(), username: username.trim().toLowerCase(), password });
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.form}>
        <Text style={styles.title}>Create your account</Text>
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
          label="Username"
          value={username}
          onChangeText={setUsername}
          autoCapitalize="none"
          autoComplete="username-new"
          error={errors.username}
        />
        <Field
          label="Password"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoComplete="new-password"
          onSubmitEditing={submit}
          error={errors.password}
        />
        <FormError message={signup.isError ? errorMessage(signup.error) : null} />
        <PrimaryButton title="Sign up" onPress={submit} loading={signup.isPending} />
        <Text style={styles.switch}>
          Already have an account?{' '}
          <Link href="/login" replace style={styles.link}>
            Log in
          </Link>
        </Text>
      </View>
    </KeyboardAvoidingView>
  );
}
