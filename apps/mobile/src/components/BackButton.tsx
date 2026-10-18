import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

/** Floating back button for full-screen video screens. */
export function BackButton() {
  return (
    <SafeAreaView edges={['top']} style={styles.wrap} pointerEvents="box-none">
      <Pressable
        onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
        accessibilityLabel="Back"
        hitSlop={12}
        style={styles.button}
      >
        <Ionicons name="chevron-back" size={30} color="#fff" />
      </Pressable>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', top: 0, left: 0 },
  button: { padding: 8 },
});
