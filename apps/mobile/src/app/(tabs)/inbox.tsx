import type { NotificationDto } from '@app/shared';
import { Image } from 'expo-image';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { Avatar } from '../../components/Avatar';
import { Empty, ErrorView, Loading, errorMessage } from '../../components/States';
import { timeAgo } from '../../lib/format';
import { colors } from '../../lib/theme';
import { useMarkAllRead, useNotifications } from '../../services/queries/notifications';

const VERB: Record<NotificationDto['type'], string> = {
  LIKE: 'liked your video',
  COMMENT: 'commented:',
  REPLY: 'replied to your comment:',
  FOLLOW: 'started following you',
};

export default function Inbox() {
  const notifications = useNotifications();
  const markAllRead = useMarkAllRead();
  const items = useMemo(
    () => notifications.data?.pages.flatMap((p) => p.items) ?? [],
    [notifications.data],
  );

  // Opening the inbox marks everything read; this visit still shows which ones were new.
  useFocusEffect(
    useCallback(() => {
      void notifications.refetch().then(() => markAllRead.mutate());
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []),
  );

  if (notifications.isPending) return <Loading />;
  if (notifications.isError) {
    return (
      <ErrorView
        message={errorMessage(notifications.error)}
        onRetry={() => void notifications.refetch()}
      />
    );
  }

  return (
    <FlatList
      style={styles.list}
      data={items}
      keyExtractor={(n) => n.id}
      renderItem={({ item }) => <NotificationRow notification={item} />}
      ListEmptyComponent={<Empty text="No notifications yet." />}
      contentContainerStyle={items.length ? undefined : styles.empty}
      onEndReached={() =>
        notifications.hasNextPage &&
        !notifications.isFetchingNextPage &&
        notifications.fetchNextPage()
      }
      refreshControl={
        <RefreshControl
          refreshing={notifications.isRefetching}
          onRefresh={() => void notifications.refetch()}
        />
      }
    />
  );
}

function NotificationRow({ notification: n }: { notification: NotificationDto }) {
  const open = () =>
    n.video
      ? n.type === 'LIKE'
        ? router.push(`/video/${n.video.id}`)
        : router.push(`/comments/${n.video.id}`)
      : router.push(`/user/${n.actor.id}`);
  return (
    <Pressable style={[styles.row, !n.read && styles.unread]} onPress={open}>
      <Pressable onPress={() => router.push(`/user/${n.actor.id}`)}>
        <Avatar user={n.actor} size={44} />
      </Pressable>
      <View style={styles.text}>
        <Text style={styles.line} numberOfLines={3}>
          <Text style={styles.actor}>{n.actor.username}</Text> {VERB[n.type]}
          {n.commentSnippet ? ` ${n.commentSnippet}` : ''}
          <Text style={styles.time}> · {timeAgo(n.createdAt)}</Text>
        </Text>
      </View>
      {n.video?.thumbnailUrl && (
        <Image source={n.video.thumbnailUrl} style={styles.thumb} contentFit="cover" />
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  list: { flex: 1, backgroundColor: colors.bg },
  empty: { flexGrow: 1 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  unread: { backgroundColor: '#EEF6FE' },
  text: { flex: 1 },
  line: { color: colors.text, fontSize: 14, lineHeight: 19 },
  actor: { fontWeight: '700' },
  time: { color: colors.muted },
  thumb: { width: 44, height: 58, borderRadius: 4, backgroundColor: colors.surface },
});
