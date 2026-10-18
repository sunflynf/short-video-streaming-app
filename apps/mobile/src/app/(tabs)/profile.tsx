import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { PrimaryButton } from '../../components/Form';
import { ProfileView } from '../../components/ProfileView';
import { useAuth } from '../../store/auth';

export default function MyProfile() {
  const { session, signOut } = useAuth();
  if (!session) return null;
  return (
    <ProfileView
      userId={session.user.id}
      actions={
        <View style={styles.row}>
          <View style={styles.flex}>
            <PrimaryButton
              title="Edit profile"
              variant="secondary"
              onPress={() => router.push('/edit-profile')}
            />
          </View>
          <View style={styles.flex}>
            <PrimaryButton title="Log out" variant="secondary" onPress={() => void signOut()} />
          </View>
        </View>
      }
    />
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 10, flex: 1 },
  flex: { flex: 1 },
});
