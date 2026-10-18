import type { Paginated, VideoDto } from '@app/shared';
import type { InfiniteData, UseInfiniteQueryResult } from '@tanstack/react-query';
import { useIsFocused } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import {
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
  type ListViewToken,
} from 'react-native';
import { useAppActive } from '../lib/use-app-active';
import { Empty, ErrorView, Loading, errorMessage } from './States';
import { VideoItem } from './VideoItem';

const VIEWABILITY = { itemVisiblePercentThreshold: 80 };

type Props = {
  query: UseInfiniteQueryResult<InfiniteData<Paginated<VideoDto>>>;
  emptyText: string;
  initialIndex?: number;
  /** Pull-to-refresh. For the For You feed this builds a fresh server snapshot. */
  onRefresh?: () => void;
};

/** Full-screen vertical pager. Plays only the visible item; preloads its neighbours. */
export function FeedList({ query, emptyText, initialIndex = 0, onRefresh }: Props) {
  const [height, setHeight] = useState(0);
  const [activeIndex, setActiveIndex] = useState(initialIndex);
  const focused = useIsFocused();
  const appActive = useAppActive();

  const videos = useMemo(() => query.data?.pages.flatMap((p) => p.items) ?? [], [query.data]);

  // FlatList requires this callback to keep the same identity for the list's lifetime.
  const onViewableItemsChanged = useCallback(
    ({ viewableItems }: { viewableItems: ListViewToken[] }) => {
      const first = viewableItems[0];
      if (first?.index != null) setActiveIndex(first.index);
    },
    [],
  );

  const onLayout = useCallback(
    (e: LayoutChangeEvent) => setHeight(e.nativeEvent.layout.height),
    [],
  );

  if (query.isPending) return <Loading dark />;
  if (query.isError) {
    return (
      <ErrorView dark message={errorMessage(query.error)} onRetry={() => void query.refetch()} />
    );
  }

  return (
    <View style={styles.container} onLayout={onLayout}>
      {height > 0 &&
        (videos.length === 0 ? (
          <Empty dark text={emptyText} />
        ) : (
          <FlatList
            data={videos}
            keyExtractor={(v) => v.id}
            renderItem={({ item, index }) => (
              <VideoItem
                video={item}
                height={height}
                active={index === activeIndex && focused && appActive}
                mounted={Math.abs(index - activeIndex) <= 1}
              />
            )}
            getItemLayout={(_, index) => ({ length: height, offset: height * index, index })}
            initialScrollIndex={Math.min(initialIndex, videos.length - 1)}
            pagingEnabled
            snapToInterval={height}
            decelerationRate="fast"
            showsVerticalScrollIndicator={false}
            onViewableItemsChanged={onViewableItemsChanged}
            viewabilityConfig={VIEWABILITY}
            windowSize={3}
            initialNumToRender={2}
            maxToRenderPerBatch={2}
            removeClippedSubviews
            onEndReachedThreshold={2}
            onEndReached={() =>
              query.hasNextPage && !query.isFetchingNextPage && query.fetchNextPage()
            }
            refreshControl={
              onRefresh ? (
                <RefreshControl
                  refreshing={query.isRefetching}
                  onRefresh={onRefresh}
                  tintColor="#fff"
                />
              ) : undefined
            }
            ListFooterComponent={
              !query.hasNextPage ? (
                <View style={[styles.footer, { height }]}>
                  <Text style={styles.footerText}>You’re all caught up</Text>
                  {onRefresh && (
                    <Pressable
                      style={styles.refresh}
                      onPress={onRefresh}
                      accessibilityRole="button"
                    >
                      <Text style={styles.refreshText}>Refresh</Text>
                    </Pressable>
                  )}
                </View>
              ) : undefined
            }
          />
        ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  footer: { alignItems: 'center', justifyContent: 'center', gap: 14 },
  footerText: { color: '#ddd', fontSize: 16 },
  refresh: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: '#fff',
  },
  refreshText: { fontWeight: '700' },
});
