import {
  AVATAR_CONTENT_TYPES,
  AVATAR_MAX_BYTES,
  USERNAME_PATTERN,
  type AvatarContentType,
} from '@app/shared';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
} from 'react-native';
import { Avatar } from '../components/Avatar';
import { Field, FormError, PrimaryButton } from '../components/Form';
import { errorMessage } from '../components/States';
import { colors } from '../lib/theme';
import { ApiRequestError } from '../services/api';
import { uploadAvatar, useUpdateProfile } from '../services/queries/users';
import { fileSize } from '../services/upload-file';
import { useMe } from '../store/auth';

export default function EditProfile() {
  const me = useMe();
  const update = useUpdateProfile();
  const [displayName, setDisplayName] = useState(me?.displayName ?? '');
  const [username, setUsername] = useState(me?.username ?? '');
  const [bio, setBio] = useState(me?.bio ?? '');
  const [avatarBusy, setAvatarBusy] = useState(false);
  if (!me) return null;

  const usernameError =
    username && !USERNAME_PATTERN.test(username.trim().toLowerCase())
      ? '3–24 characters: letters, numbers, _ or .'
      : undefined;

  const save = () => {
    if (usernameError) return;
    update.mutate(
      {
        id: me.id,
        displayName: displayName.trim() || null,
        username: username.trim().toLowerCase(),
        bio: bio.trim() || null,
      },
      { onSuccess: () => router.back() },
    );
  };

  const changeAvatar = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    const asset = result.canceled ? undefined : result.assets[0];
    if (!asset) return;
    const contentType = (asset.mimeType ?? 'image/jpeg') as AvatarContentType;
    if (!AVATAR_CONTENT_TYPES.includes(contentType)) {
      Alert.alert('Unsupported image', 'Use a JPEG, PNG or WebP image.');
      return;
    }
    setAvatarBusy(true);
    try {
      const size = asset.fileSize ?? (await fileSize(asset.uri));
      if (!size || size > AVATAR_MAX_BYTES) throw new Error('Images can be up to 5 MB.');
      const avatarUrl = await uploadAvatar(asset.uri, contentType, size);
      await update.mutateAsync({ id: me.id, avatarUrl });
    } catch (err) {
      Alert.alert(
        'Could not update photo',
        err instanceof ApiRequestError && err.status === 503
          ? 'Profile photos aren’t available on this server yet.'
          : errorMessage(err),
      );
    } finally {
      setAvatarBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Pressable style={styles.avatar} onPress={() => void changeAvatar()} disabled={avatarBusy}>
          <Avatar user={me} size={96} />
          <Text style={styles.change}>{avatarBusy ? 'Uploading…' : 'Change photo'}</Text>
        </Pressable>
        <Field label="Name" value={displayName} onChangeText={setDisplayName} maxLength={50} />
        <Field
          label="Username"
          value={username}
          onChangeText={setUsername}
          autoCapitalize="none"
          error={usernameError}
        />
        <Field label="Bio" value={bio} onChangeText={setBio} maxLength={160} multiline />
        <FormError message={update.isError ? errorMessage(update.error) : null} />
        <PrimaryButton title="Save" onPress={save} loading={update.isPending} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 20, gap: 16 },
  avatar: { alignItems: 'center', gap: 8 },
  change: { color: colors.accent, fontWeight: '600' },
});
