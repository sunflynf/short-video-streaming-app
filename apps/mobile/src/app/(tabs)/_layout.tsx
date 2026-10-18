import Ionicons from '@expo/vector-icons/Ionicons';
import { Tabs } from 'expo-router';
import type { ColorValue } from 'react-native';
import { colors } from '../../lib/theme';
import { useUnreadCount } from '../../services/queries/notifications';

type IconName = keyof typeof Ionicons.glyphMap;

function icon(name: IconName) {
  return function TabIcon({ color, size }: { color: ColorValue; size: number }) {
    return <Ionicons name={name} color={color as string} size={size} />;
  };
}

export default function TabsLayout() {
  const unread = useUnreadCount(true).data?.count ?? 0;
  return (
    <Tabs screenOptions={{ tabBarActiveTintColor: colors.accent, headerShadowVisible: false }}>
      <Tabs.Screen
        name="home"
        options={{ title: 'Home', headerShown: false, tabBarIcon: icon('home') }}
      />
      <Tabs.Screen name="upload" options={{ title: 'Upload', tabBarIcon: icon('add-circle') }} />
      <Tabs.Screen
        name="inbox"
        options={{
          title: 'Inbox',
          tabBarIcon: icon('notifications'),
          tabBarBadge: unread > 0 ? (unread > 99 ? '99+' : unread) : undefined,
        }}
      />
      <Tabs.Screen name="profile" options={{ title: 'Profile', tabBarIcon: icon('person') }} />
    </Tabs>
  );
}
