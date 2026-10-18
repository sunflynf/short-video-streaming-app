import { CAPTION_MAX_LENGTH, type CreateUploadResponse, type VideoDto } from '@app/shared';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useQueryClient } from '@tanstack/react-query';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Field, FormError, PrimaryButton } from '../../components/Form';
import { errorMessage } from '../../components/States';
import { colors } from '../../lib/theme';
import { validateClip } from '../../lib/validate-clip';
import { ApiRequestError, apiFetch } from '../../services/api';
import { queryKeys } from '../../services/query-keys';
import { uploadFile, type UploadHandle } from '../../services/upload-file';
import { useMe } from '../../store/auth';

type Picked = { uri: string; mimeType: string; durationMs?: number | null; fileSize?: number };

type Stage =
  | { kind: 'idle' }
  | { kind: 'uploading'; progress: number }
  | { kind: 'processing'; videoId: string }
  | { kind: 'failed'; message: string };

const POLL_MS = 3000;
const PROCESSING_TIMEOUT_MS = 10 * 60 * 1000;

export default function Upload() {
  const me = useMe();
  const qc = useQueryClient();
  const [clip, setClip] = useState<Picked | null>(null);
  const [caption, setCaption] = useState('');
  const [stage, setStage] = useState<Stage>({ kind: 'idle' });
  const upload = useRef<UploadHandle | null>(null);
  const busy = stage.kind === 'uploading' || stage.kind === 'processing';

  // Poll until Mux has transcoded the clip.
  useEffect(() => {
    if (stage.kind !== 'processing') return;
    const started = Date.now();
    const timer = setInterval(async () => {
      try {
        const video = await apiFetch<VideoDto>(`/videos/${stage.videoId}`);
        if (video.status === 'READY') {
          clearInterval(timer);
          setStage({ kind: 'idle' });
          setClip(null);
          setCaption('');
          if (me) void qc.invalidateQueries({ queryKey: queryKeys.userVideos(me.id) });
          router.push(`/video/${video.id}`);
        } else if (video.status === 'FAILED') {
          clearInterval(timer);
          setStage({
            kind: 'failed',
            message: 'Processing failed. Is it a valid video under 60 seconds?',
          });
        } else if (Date.now() - started > PROCESSING_TIMEOUT_MS) {
          clearInterval(timer);
          setStage({
            kind: 'failed',
            message: 'Still processing. It will appear on your profile when ready.',
          });
        }
      } catch {
        // Transient network errors: keep polling.
      }
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [stage, me, qc]);

  const pick = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['videos'],
      videoMaxDuration: 60,
      quality: 1,
    });
    const asset = result.canceled ? undefined : result.assets[0];
    if (!asset) return;
    const problem = validateClip({ durationMs: asset.duration, fileSize: asset.fileSize });
    if (problem) {
      Alert.alert('Can’t use this clip', problem);
      return;
    }
    setClip({
      uri: asset.uri,
      mimeType: asset.mimeType ?? 'video/mp4',
      durationMs: asset.duration,
      fileSize: asset.fileSize,
    });
    setStage({ kind: 'idle' });
  };

  const start = async () => {
    if (!clip) return;
    setStage({ kind: 'uploading', progress: 0 });
    try {
      // Ask for the upload URL right before uploading: it expires after about an hour.
      const { videoId, uploadUrl } = await apiFetch<CreateUploadResponse>('/videos/upload', {
        method: 'POST',
        body: caption.trim() ? { caption: caption.trim() } : {},
      });
      upload.current = uploadFile(clip.uri, uploadUrl, clip.mimeType, (progress) =>
        setStage({ kind: 'uploading', progress }),
      );
      await upload.current.done;
      setStage({ kind: 'processing', videoId });
    } catch (err) {
      setStage({ kind: 'failed', message: uploadErrorMessage(err) });
    } finally {
      upload.current = null;
    }
  };

  const cancel = () => {
    upload.current?.cancel();
    setStage({ kind: 'idle' });
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {!clip ? (
          <View style={styles.pickArea}>
            <Ionicons name="videocam" size={56} color={colors.accent} />
            <Text style={styles.hint}>Share a vertical clip up to 60 seconds.</Text>
            <PrimaryButton title="Choose a video" onPress={() => void pick()} />
          </View>
        ) : (
          <>
            <View style={styles.selected}>
              <Ionicons name="film" size={28} color={colors.text} />
              <Text style={styles.selectedText}>
                Video selected
                {clip.durationMs ? ` · ${Math.round(clip.durationMs / 1000)}s` : ''}
                {clip.fileSize ? ` · ${(clip.fileSize / 1024 / 1024).toFixed(1)} MB` : ''}
              </Text>
              {!busy && (
                <Text style={styles.change} onPress={() => void pick()}>
                  Change
                </Text>
              )}
            </View>
            <Field
              label="Caption"
              value={caption}
              onChangeText={setCaption}
              maxLength={CAPTION_MAX_LENGTH}
              multiline
              editable={!busy}
              placeholder="Describe your video"
            />
            {stage.kind === 'uploading' && (
              <View style={styles.progressWrap}>
                <View style={styles.progressTrack}>
                  <View
                    style={[styles.progressBar, { width: `${Math.round(stage.progress * 100)}%` }]}
                  />
                </View>
                <Text style={styles.status}>Uploading… {Math.round(stage.progress * 100)}%</Text>
              </View>
            )}
            {stage.kind === 'processing' && (
              <Text style={styles.status}>Processing… this usually takes under a minute.</Text>
            )}
            <FormError message={stage.kind === 'failed' ? stage.message : null} />
            {stage.kind === 'uploading' ? (
              <PrimaryButton title="Cancel" variant="secondary" onPress={cancel} />
            ) : (
              <PrimaryButton
                title={stage.kind === 'failed' ? 'Try again' : 'Post'}
                onPress={() => void start()}
                loading={stage.kind === 'processing'}
              />
            )}
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function uploadErrorMessage(err: unknown): string {
  if (err instanceof ApiRequestError && err.status === 503) {
    return 'Uploads aren’t available on this server yet.';
  }
  if (err instanceof ApiRequestError && err.status === 429) return err.message;
  return errorMessage(err);
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 20, gap: 16, flexGrow: 1 },
  pickArea: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    paddingVertical: 60,
  },
  hint: { color: colors.muted, fontSize: 15, textAlign: 'center' },
  selected: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 14,
    borderRadius: 10,
    backgroundColor: colors.surface,
  },
  selectedText: { flex: 1, color: colors.text, fontWeight: '600' },
  change: { color: colors.accent, fontWeight: '600' },
  progressWrap: { gap: 6 },
  progressTrack: {
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.surface,
    overflow: 'hidden',
  },
  progressBar: { height: 8, backgroundColor: colors.accent },
  status: { color: colors.muted, textAlign: 'center' },
});
