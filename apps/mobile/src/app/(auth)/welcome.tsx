import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { PrimaryButton } from '../../components/Form';
import { colors } from '../../lib/theme';

export default function Welcome() {
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.hero}>
        <Text style={styles.logo}>ShortVid</Text>
        <Text style={styles.tagline}>Short videos from creators you’ll love.</Text>
      </View>
      <View style={styles.actions}>
        <PrimaryButton title="Create account" onPress={() => router.push('/signup')} />
        <PrimaryButton title="Log in" variant="secondary" onPress={() => router.push('/login')} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, backgroundColor: colors.bg },
  hero: { flex: 1, justifyContent: 'center', gap: 10 },
  logo: { fontSize: 44, fontWeight: '800', color: colors.text },
  tagline: { fontSize: 18, color: colors.muted },
  actions: { gap: 12 },
});
