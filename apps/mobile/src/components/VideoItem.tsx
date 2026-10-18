import type { VideoDto } from '@app/shared';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useVideoPlayer, VideoView } from 'expo-video';
import { memo, useEffect, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { recordView, useToggleLike } from '../services/queries/videos';
import { usePlayer } from '../store/player';
import { ActionRail } from './ActionRail';

const DOUBLE_TAP_MS = 280;

type Props = {
  video: VideoDto;
  height: number;
  /** The item on screen, in a focused tab, with the app in the foreground. */
  active: boolean;
  /** Only the active item and its neighbours hold a player, to keep memory bounded. */
  mounted: boolean;
};

export const VideoItem = memo(function VideoItem({ video, height, active, mounted }: Props) {
  const [userPaused, setUserPaused] = useState(false);
  const muted = usePlayer((s) => s.muted);
  const toggleMuted = usePlayer((s) => s.toggleMuted);
  const like = useToggleLike();
  const [heart] = useState(() => new Animated.Value(0));
  const lastTap = useRef(0);
  const singleTapTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Resume when scrolling back to this item (adjusting state during render, not in an effect).
  const [wasActive, setWasActive] = useState(active);
  if (active !== wasActive) {
    setWasActive(active);
    if (!active) setUserPaused(false);
  }

  useViewReporting(video, active && !userPaused);

  const onPress = () => {
    const now = Date.now();
    if (now - lastTap.current < DOUBLE_TAP_MS) {
      clearTimeout(singleTapTimer.current);
      lastTap.current = 0;
      if (!video.likedByMe) like.mutate({ videoId: video.id, like: true });
      heart.setValue(1);
      Animated.timing(heart, { toValue: 0, duration: 700, useNativeDriver: true }).start();
      return;
    }
    lastTap.current = now;
    singleTapTimer.current = setTimeout(() => setUserPaused((p) => !p), DOUBLE_TAP_MS);
  };

  const portrait = video.aspectRatio ? isPortrait(video.aspectRatio) : true;

  return (
    <View style={[styles.item, { height }]}>
      {video.thumbnailUrl && (
        <Image
          source={video.thumbnailUrl}
          style={StyleSheet.absoluteFill}
          contentFit={portrait ? 'cover' : 'contain'}
        />
      )}
      {mounted && video.playbackUrl && (
        <Player
          url={video.playbackUrl}
          playing={active && !userPaused}
          active={active}
          muted={muted}
          fit={portrait ? 'cover' : 'contain'}
        />
      )}

      <Pressable
        style={StyleSheet.absoluteFill}
        onPress={onPress}
        accessibilityLabel="Play or pause"
      >
        {userPaused && (
          <View style={styles.center}>
            <Ionicons name="play" size={72} color="rgba(255,255,255,0.8)" />
          </View>
        )}
        <Animated.View
          pointerEvents="none"
          style={[
            styles.center,
            { opacity: heart, transform: [{ scale: Animated.add(1, heart) }] },
          ]}
        >
          <Ionicons name="heart" size={96} color="#FF3B5C" />
        </Animated.View>
      </Pressable>

      <Pressable
        style={styles.mute}
        onPress={toggleMuted}
        accessibilityLabel={muted ? 'Unmute' : 'Mute'}
        hitSlop={10}
      >
        <Ionicons name={muted ? 'volume-mute' : 'volume-high'} size={22} color="#fff" />
      </Pressable>

      <View style={styles.meta} pointerEvents="box-none">
        <Pressable onPress={() => router.push(`/user/${video.author.id}`)}>
          <Text style={styles.username}>@{video.author.username}</Text>
        </Pressable>
        {!!video.caption && (
          <Text style={styles.caption} numberOfLines={3}>
            {video.caption}
          </Text>
        )}
      </View>
      <View style={styles.rail}>
        <ActionRail video={video} />
      </View>
    </View>
  );
});

function Player(props: {
  url: string;
  playing: boolean;
  active: boolean;
  muted: boolean;
  fit: 'cover' | 'contain';
}) {
  const player = useVideoPlayer(props.url, (p) => {
    p.loop = true;
  });

  // expo-video players are imperative native objects that are meant to be mutated.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/immutability
    player.muted = props.muted;
  }, [player, props.muted]);

  useEffect(() => {
    if (props.playing) {
      player.play();
    } else {
      player.pause();
    }
  }, [player, props.playing]);

  // Start from the beginning next time this clip becomes the active one.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/immutability
    if (!props.active) player.currentTime = 0;
  }, [player, props.active]);

  return (
    <VideoView
      player={player}
      style={StyleSheet.absoluteFill}
      contentFit={props.fit}
      nativeControls={false}
    />
  );
}

/** Reports one view per mount once the clip has played long enough to count. */
function useViewReporting(video: VideoDto, playing: boolean) {
  const reported = useRef(false);
  useEffect(() => {
    if (!playing || reported.current) return;
    const thresholdMs = video.durationSec ? Math.min(3000, video.durationSec * 500) : 3000;
    const timer = setTimeout(() => {
      reported.current = true;
      recordView(video.id, thresholdMs);
    }, thresholdMs);
    return () => clearTimeout(timer);
  }, [playing, video.id, video.durationSec]);
}

function isPortrait(aspectRatio: string): boolean {
  const [w, h] = aspectRatio.split(':').map(Number);
  return !w || !h || h >= w;
}

const shadow = { textShadowColor: 'rgba(0,0,0,0.6)', textShadowRadius: 4 };

const styles = StyleSheet.create({
  item: { width: '100%', backgroundColor: '#000', overflow: 'hidden' },
  center: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
  mute: { position: 'absolute', top: 56, right: 16 },
  meta: { position: 'absolute', left: 14, right: 90, bottom: 24, gap: 6 },
  username: { color: '#fff', fontWeight: '700', fontSize: 16, ...shadow },
  caption: { color: '#fff', fontSize: 14, lineHeight: 19, ...shadow },
  rail: { position: 'absolute', right: 10, bottom: 28 },
});
