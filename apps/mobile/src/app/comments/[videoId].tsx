import type { CommentDto } from '@app/shared';
import { COMMENT_MAX_LENGTH } from '@app/shared';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Avatar } from '../../components/Avatar';
import { Empty, ErrorView, Loading, errorMessage } from '../../components/States';
import { timeAgo } from '../../lib/format';
import { colors } from '../../lib/theme';
import {
  useComments,
  useCreateComment,
  useDeleteComment,
  useReplies,
} from '../../services/queries/comments';
import { useMe } from '../../store/auth';

export default function Comments() {
  const { videoId } = useLocalSearchParams<{ videoId: string }>();
  const comments = useComments(videoId);
  const create = useCreateComment(videoId);
  const [body, setBody] = useState('');
  const [replyTo, setReplyTo] = useState<CommentDto | null>(null);
  const items = useMemo(() => comments.data?.pages.flatMap((p) => p.items) ?? [], [comments.data]);

  const send = () => {
    const text = body.trim();
    if (!text) return;
    create.mutate(
      { body: text, ...(replyTo && { parentId: replyTo.id }) },
      {
        onSuccess: () => {
          setBody('');
          setReplyTo(null);
        },
        onError: (err) => Alert.alert('Could not post comment', errorMessage(err)),
      },
    );
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 64 : 0}
    >
      {comments.isPending ? (
        <Loading />
      ) : comments.isError ? (
        <ErrorView message={errorMessage(comments.error)} onRetry={() => void comments.refetch()} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(c) => c.id}
          renderItem={({ item }) => (
            <CommentThread comment={item} videoId={videoId} onReply={setReplyTo} />
          )}
          ListEmptyComponent={<Empty text="No comments yet. Be the first!" />}
          onEndReached={() =>
            comments.hasNextPage && !comments.isFetchingNextPage && comments.fetchNextPage()
          }
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={items.length ? undefined : styles.emptyContainer}
        />
      )}
      <SafeAreaView edges={['bottom']} style={styles.composerWrap}>
        {replyTo && (
          <View style={styles.replying}>
            <Text style={styles.replyingText}>Replying to @{replyTo.author.username}</Text>
            <Pressable
              onPress={() => setReplyTo(null)}
              accessibilityLabel="Cancel reply"
              hitSlop={8}
            >
              <Ionicons name="close" size={18} color={colors.muted} />
            </Pressable>
          </View>
        )}
        <View style={styles.composer}>
          <TextInput
            style={styles.input}
            value={body}
            onChangeText={setBody}
            placeholder={replyTo ? 'Write a reply…' : 'Add a comment…'}
            placeholderTextColor={colors.muted}
            maxLength={COMMENT_MAX_LENGTH}
            multiline
            accessibilityLabel="Comment"
          />
          <Pressable
            onPress={send}
            disabled={!body.trim() || create.isPending}
            accessibilityLabel="Send comment"
            style={[styles.send, (!body.trim() || create.isPending) && styles.sendDisabled]}
          >
            <Ionicons name="arrow-up" size={20} color="#fff" />
          </Pressable>
        </View>
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
}

function CommentThread({
  comment,
  videoId,
  onReply,
}: {
  comment: CommentDto;
  videoId: string;
  onReply(c: CommentDto): void;
}) {
  const [open, setOpen] = useState(false);
  const replies = useReplies(comment.id, open);
  const items = replies.data?.pages.flatMap((p) => p.items) ?? [];
  return (
    <View>
      <CommentRow comment={comment} videoId={videoId} onReply={onReply} />
      {comment.replyCount > 0 && (
        <Pressable style={styles.toggle} onPress={() => setOpen((o) => !o)}>
          <Text style={styles.toggleText}>
            {open
              ? 'Hide replies'
              : `View ${comment.replyCount} ${comment.replyCount === 1 ? 'reply' : 'replies'}`}
          </Text>
        </Pressable>
      )}
      {open &&
        items.map((reply) => (
          <View key={reply.id} style={styles.reply}>
            <CommentRow comment={reply} videoId={videoId} onReply={() => onReply(comment)} />
          </View>
        ))}
      {open && replies.hasNextPage && (
        <Pressable style={styles.toggle} onPress={() => void replies.fetchNextPage()}>
          <Text style={styles.toggleText}>More replies</Text>
        </Pressable>
      )}
    </View>
  );
}

function CommentRow({
  comment,
  videoId,
  onReply,
}: {
  comment: CommentDto;
  videoId: string;
  onReply(c: CommentDto): void;
}) {
  const me = useMe();
  const remove = useDeleteComment(videoId);
  const canDelete = !comment.deleted && me?.id === comment.author.id;

  const confirmDelete = () =>
    Alert.alert('Delete comment?', undefined, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () =>
          remove.mutate(comment, {
            onError: (err) => Alert.alert('Could not delete', errorMessage(err)),
          }),
      },
    ]);

  return (
    <Pressable style={styles.row} onLongPress={canDelete ? confirmDelete : undefined}>
      <Pressable onPress={() => router.push(`/user/${comment.author.id}`)}>
        <Avatar user={comment.author} size={34} />
      </Pressable>
      <View style={styles.rowBody}>
        <Text style={styles.author}>
          {comment.author.username} <Text style={styles.time}>· {timeAgo(comment.createdAt)}</Text>
        </Text>
        <Text style={[styles.body, comment.deleted && styles.deleted]}>{comment.body}</Text>
        {!comment.deleted && (
          <View style={styles.rowActions}>
            <Pressable onPress={() => onReply(comment)} hitSlop={6}>
              <Text style={styles.action}>Reply</Text>
            </Pressable>
            {canDelete && (
              <Pressable onPress={confirmDelete} hitSlop={6} accessibilityLabel="Delete comment">
                <Text style={styles.action}>Delete</Text>
              </Pressable>
            )}
          </View>
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  emptyContainer: { flexGrow: 1 },
  row: { flexDirection: 'row', gap: 10, paddingHorizontal: 16, paddingVertical: 10 },
  rowBody: { flex: 1, gap: 3 },
  author: { fontWeight: '600', color: colors.text, fontSize: 13 },
  time: { fontWeight: '400', color: colors.muted },
  body: { color: colors.text, fontSize: 15, lineHeight: 20 },
  deleted: { color: colors.muted, fontStyle: 'italic' },
  rowActions: { flexDirection: 'row', gap: 16, marginTop: 2 },
  action: { color: colors.muted, fontSize: 13, fontWeight: '600' },
  reply: { paddingLeft: 44 },
  toggle: { paddingLeft: 60, paddingBottom: 8 },
  toggleText: { color: colors.muted, fontWeight: '600', fontSize: 13 },
  composerWrap: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.bg,
  },
  replying: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  replyingText: { color: colors.muted, fontSize: 13 },
  composer: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, padding: 10 },
  input: {
    flex: 1,
    maxHeight: 110,
    minHeight: 40,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 10,
    backgroundColor: colors.surface,
    color: colors.text,
    fontSize: 15,
  },
  send: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendDisabled: { opacity: 0.4 },
});
