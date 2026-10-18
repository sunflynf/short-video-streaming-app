import { useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';
import { BackButton } from '../../../components/BackButton';
import { FeedList } from '../../../components/FeedList';
import { useUserVideos } from '../../../services/queries/videos';

/** A creator's videos as a swipeable pager, opened from their profile grid. */
export default function UserFeed() {
  const { id, index } = useLocalSearchParams<{ id: string; index?: string }>();
  const query = useUserVideos(id);
  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      <FeedList query={query} emptyText="No videos yet." initialIndex={Number(index) || 0} />
      <BackButton />
    </View>
  );
}
