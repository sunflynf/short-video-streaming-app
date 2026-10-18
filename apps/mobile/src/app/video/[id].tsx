import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { BackButton } from '../../components/BackButton';
import { ErrorView, Loading, errorMessage } from '../../components/States';
import { VideoItem } from '../../components/VideoItem';
import { useAppActive } from '../../lib/use-app-active';
import { useVideo } from '../../services/queries/videos';

/** A single video: the deep-link target for shortvid://video/:id and shared links. */
export default function VideoScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const video = useVideo(id);
  const [height, setHeight] = useState(0);
  const appActive = useAppActive();

  return (
    <View
      style={{ flex: 1, backgroundColor: '#000' }}
      onLayout={(e) => setHeight(e.nativeEvent.layout.height)}
    >
      {video.isPending ? (
        <Loading dark />
      ) : video.isError ? (
        <ErrorView dark message={errorMessage(video.error)} onRetry={() => void video.refetch()} />
      ) : (
        height > 0 && <VideoItem video={video.data} height={height} active={appActive} mounted />
      )}
      <BackButton />
    </View>
  );
}
