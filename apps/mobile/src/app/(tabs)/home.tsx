import type { FeedTab } from '@app/shared';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FeedList } from '../../components/FeedList';
import { useFeed } from '../../services/queries/videos';
import { queryKeys } from '../../services/query-keys';

const TABS: { tab: FeedTab; label: string }[] = [
  { tab: 'following', label: 'Following' },
  { tab: 'foryou', label: 'For You' },
];

export default function Home() {
  const [tab, setTab] = useState<FeedTab>('foryou');
  return (
    <View style={styles.container}>
      {/* key: each tab gets its own pager (scroll position and active video). */}
      <TabFeed key={tab} tab={tab} />
      <SafeAreaView edges={['top']} style={styles.switcher} pointerEvents="box-none">
        <View style={styles.tabs}>
          {TABS.map(({ tab: t, label }) => (
            <Pressable
              key={t}
              onPress={() => setTab(t)}
              accessibilityRole="tab"
              accessibilityState={{ selected: tab === t }}
            >
              <Text style={[styles.tab, tab === t && styles.tabActive]}>{label}</Text>
            </Pressable>
          ))}
        </View>
      </SafeAreaView>
    </View>
  );
}

function TabFeed({ tab }: { tab: FeedTab }) {
  const query = useFeed(tab);
  const qc = useQueryClient();
  return (
    <FeedList
      query={query}
      emptyText={
        tab === 'following' ? 'Follow creators to see their videos here.' : 'No videos yet.'
      }
      // Resetting (not refetching) asks the server for a new, seen-filtered snapshot.
      onRefresh={() => void qc.resetQueries({ queryKey: queryKeys.feed(tab) })}
    />
  );
}

const shadow = { textShadowColor: 'rgba(0,0,0,0.6)', textShadowRadius: 4 };

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  switcher: { position: 'absolute', top: 0, left: 0, right: 0 },
  tabs: { flexDirection: 'row', justifyContent: 'center', gap: 24, paddingTop: 8 },
  tab: { color: 'rgba(255,255,255,0.7)', fontSize: 17, fontWeight: '600', ...shadow },
  tabActive: { color: '#fff', fontWeight: '800', textDecorationLine: 'underline' },
});
