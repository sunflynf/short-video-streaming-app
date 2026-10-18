import type { VideoDto } from '@app/shared';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { formatCount } from '../lib/format';
import { colors } from '../lib/theme';
import { useToggleFollow } from '../services/queries/users';
import { shareVideo, useToggleLike } from '../services/queries/videos';
import { useMe } from '../store/auth';
import { Avatar } from './Avatar';
import { errorMessage } from './States';

export function ActionRail({ video }: { video: VideoDto }) {
  const me = useMe();
  const like = useToggleLike();
  const follow = useToggleFollow();
  const isOwn = me?.id === video.author.id;

  return (
    <View style={styles.rail}>
      <View>
        <Pressable
          onPress={() => router.push(`/user/${video.author.id}`)}
          accessibilityLabel={`Open @${video.author.username}'s profile`}
        >
          <Avatar user={video.author} size={46} />
        </Pressable>
        {!isOwn && !video.followingAuthor && (
          <Pressable
            style={styles.follow}
            onPress={() => follow.mutate({ userId: video.author.id, follow: true })}
            accessibilityLabel={`Follow @${video.author.username}`}
            hitSlop={8}
          >
            <Ionicons name="add" size={14} color="#fff" />
          </Pressable>
        )}
      </View>

      <RailButton
        icon={video.likedByMe ? 'heart' : 'heart-outline'}
        color={video.likedByMe ? colors.like : '#fff'}
        label={formatCount(video.likeCount)}
        accessibilityLabel={video.likedByMe ? 'Unlike' : 'Like'}
        onPress={() => like.mutate({ videoId: video.id, like: !video.likedByMe })}
      />
      <RailButton
        icon="chatbubble-ellipses"
        label={formatCount(video.commentCount)}
        accessibilityLabel="Comments"
        onPress={() => router.push(`/comments/${video.id}`)}
      />
      <RailButton
        icon="arrow-redo"
        label={formatCount(video.shareCount)}
        accessibilityLabel="Share"
        onPress={() =>
          shareVideo(video).catch((err) => Alert.alert('Could not share', errorMessage(err)))
        }
      />
    </View>
  );
}

function RailButton(props: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  color?: string;
  accessibilityLabel: string;
  onPress(): void;
}) {
  return (
    <Pressable
      onPress={props.onPress}
      style={styles.button}
      accessibilityRole="button"
      accessibilityLabel={props.accessibilityLabel}
      hitSlop={6}
    >
      <Ionicons name={props.icon} size={34} color={props.color ?? '#fff'} />
      <Text style={styles.label}>{props.label}</Text>
    </Pressable>
  );
}

const shadow = { textShadowColor: 'rgba(0,0,0,0.6)', textShadowRadius: 4 };

const styles = StyleSheet.create({
  rail: { alignItems: 'center', gap: 18 },
  follow: {
    position: 'absolute',
    bottom: -8,
    alignSelf: 'center',
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.like,
    alignItems: 'center',
    justifyContent: 'center',
  },
  button: { alignItems: 'center' },
  label: { color: '#fff', fontSize: 13, fontWeight: '600', marginTop: 2, ...shadow },
});
