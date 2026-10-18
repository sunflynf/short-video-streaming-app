import type { UserProfile, VideoDto } from '@app/shared';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useMemo } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { formatCount } from '../lib/format';
import { colors } from '../lib/theme';
import { useProfile, useToggleFollow } from '../services/queries/users';
import { useUserVideos } from '../services/queries/videos';
import { useMe } from '../store/auth';
import { Avatar } from './Avatar';
import { PrimaryButton } from './Form';
import { Empty, ErrorView, Loading, errorMessage } from './States';

/** Profile header + 3-column grid of published videos. Used for your own and others' profiles. */
export function ProfileView({ userId, actions }: { userId: string; actions?: React.ReactNode }) {
  const profile = useProfile(userId);
  const videos = useUserVideos(userId);
  const items = useMemo(() => videos.data?.pages.flatMap((p) => p.items) ?? [], [videos.data]);

  if (profile.isPending) return <Loading />;
  if (profile.isError) {
    return (
      <ErrorView message={errorMessage(profile.error)} onRetry={() => void profile.refetch()} />
    );
  }

  return (
    <FlatList
      style={styles.list}
      data={items}
      numColumns={3}
      keyExtractor={(v) => v.id}
      ListHeaderComponent={<Header profile={profile.data} actions={actions} />}
      renderItem={({ item, index }) => <GridCell video={item} userId={userId} index={index} />}
      ListEmptyComponent={videos.isPending ? <Loading /> : <Empty text="No videos yet." />}
      onEndReached={() =>
        videos.hasNextPage && !videos.isFetchingNextPage && videos.fetchNextPage()
      }
      refreshControl={
        <RefreshControl
          refreshing={profile.isRefetching || videos.isRefetching}
          onRefresh={() => {
            void profile.refetch();
            void videos.refetch();
          }}
        />
      }
    />
  );
}

function Header({ profile, actions }: { profile: UserProfile; actions?: React.ReactNode }) {
  const me = useMe();
  const follow = useToggleFollow();
  const isOwn = me?.id === profile.id;
  return (
    <View style={styles.header}>
      <Avatar user={profile} size={88} />
      {!!profile.displayName && <Text style={styles.name}>{profile.displayName}</Text>}
      <Text style={styles.username}>@{profile.username}</Text>
      <View style={styles.stats}>
        <Stat value={profile.followingCount} label="Following" />
        <Stat value={profile.followerCount} label="Followers" />
        <Stat value={profile.videoCount} label="Videos" />
      </View>
      {!!profile.bio && <Text style={styles.bio}>{profile.bio}</Text>}
      <View style={styles.actions}>
        {isOwn ? (
          actions
        ) : (
          <PrimaryButton
            title={profile.isFollowing ? 'Following' : 'Follow'}
            variant={profile.isFollowing ? 'secondary' : 'primary'}
            onPress={() => follow.mutate({ userId: profile.id, follow: !profile.isFollowing })}
          />
        )}
      </View>
    </View>
  );
}

const Stat = ({ value, label }: { value: number; label: string }) => (
  <View style={styles.stat}>
    <Text style={styles.statValue}>{formatCount(value)}</Text>
    <Text style={styles.statLabel}>{label}</Text>
  </View>
);

function GridCell({ video, userId, index }: { video: VideoDto; userId: string; index: number }) {
  return (
    <Pressable
      style={styles.cell}
      onPress={() => router.push({ pathname: '/user/[id]/feed', params: { id: userId, index } })}
      accessibilityLabel={video.caption ?? 'Open video'}
    >
      {video.thumbnailUrl ? (
        <Image source={video.thumbnailUrl} style={StyleSheet.absoluteFill} contentFit="cover" />
      ) : (
        <View style={[StyleSheet.absoluteFill, styles.placeholder]} />
      )}
      <View style={styles.cellMeta}>
        <Ionicons name="heart" size={12} color="#fff" />
        <Text style={styles.cellText}>{formatCount(video.likeCount)}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  list: { flex: 1, backgroundColor: colors.bg },
  header: { alignItems: 'center', padding: 20, gap: 6 },
  name: { fontSize: 20, fontWeight: '700', color: colors.text, marginTop: 6 },
  username: { fontSize: 15, color: colors.muted },
  stats: { flexDirection: 'row', gap: 28, marginTop: 12 },
  stat: { alignItems: 'center' },
  statValue: { fontSize: 18, fontWeight: '700', color: colors.text },
  statLabel: { fontSize: 12, color: colors.muted },
  bio: { textAlign: 'center', color: colors.text, marginTop: 8 },
  actions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 12,
    alignSelf: 'stretch',
    justifyContent: 'center',
  },
  cell: { flex: 1 / 3, aspectRatio: 9 / 16, margin: 1, backgroundColor: '#222' },
  placeholder: { backgroundColor: '#333' },
  cellMeta: {
    position: 'absolute',
    left: 6,
    bottom: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  cellText: { color: '#fff', fontSize: 12, fontWeight: '600' },
});
