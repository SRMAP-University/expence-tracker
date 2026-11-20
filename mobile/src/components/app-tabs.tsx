import { TabList, TabSlot, TabTrigger, Tabs, type TabListProps, type TabTriggerSlotProps } from 'expo-router/ui';
import { useEffect } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon, type IconName } from '@/components/icon';
import { Colors, Radius, Shadow, TabBarHeight, TabBarMargin } from '@/constants/theme';
import { useKeyboardVisible } from '@/hooks/use-keyboard-visible';

type TabHref = '/' | '/stats' | '/accounts' | '/transactions' | '/assistant';

const TABS: { name: string; href: TabHref; label: string; icon: IconName }[] = [
  { name: 'index', href: '/', label: 'Home', icon: 'home' },
  { name: 'stats', href: '/stats', label: 'Overview', icon: 'chart' },
  { name: 'accounts', href: '/accounts', label: 'Accounts', icon: 'wallet' },
  { name: 'transactions', href: '/transactions', label: 'Activity', icon: 'list' },
  { name: 'assistant', href: '/assistant', label: 'Ask AI', icon: 'sparkle' },
];

type TabButtonProps = TabTriggerSlotProps & { icon: IconName; label: string };

// TabTrigger's slot ref is typed for a different host element than Pressable's; the tab bar doesn't need it.
function TabButton({ isFocused, icon, label, ref: _ref, ...props }: TabButtonProps) {
  const focus = useSharedValue(isFocused ? 1 : 0);

  useEffect(() => {
    focus.set(withSpring(isFocused ? 1 : 0, { damping: 16, stiffness: 240 }));
  }, [isFocused, focus]);

  // The white disc springs open behind the icon of the active tab.
  const disc = useAnimatedStyle(() => ({
    opacity: focus.get(),
    transform: [{ scale: 0.6 + 0.4 * focus.get() }],
  }));

  return (
    <Pressable
      {...props}
      accessibilityRole="tab"
      accessibilityLabel={label}
      accessibilityState={{ selected: !!isFocused }}
      style={styles.tab}>
      <Animated.View style={[styles.disc, disc]} />
      <Icon name={icon} size={22} color={isFocused ? Colors.onPaper : Colors.onForest} />
    </Pressable>
  );
}

/** Floating forest pill, centred above the home indicator. Hidden while typing. */
function FloatingTabList({ children, ...props }: TabListProps) {
  const insets = useSafeAreaInsets();
  const keyboardVisible = useKeyboardVisible();
  return (
    <View
      {...props}
      pointerEvents="box-none"
      style={[styles.dock, { bottom: insets.bottom + TabBarMargin }, keyboardVisible && styles.hidden]}>
      <View style={styles.pill}>{children}</View>
    </View>
  );
}

export default function AppTabs() {
  return (
    <Tabs style={styles.root}>
      <TabSlot style={styles.root} />
      <TabList asChild>
        <FloatingTabList>
          {TABS.map((tab) => (
            <TabTrigger key={tab.name} name={tab.name} href={tab.href} asChild>
              <TabButton icon={tab.icon} label={tab.label} />
            </TabTrigger>
          ))}
        </FloatingTabList>
      </TabList>
    </Tabs>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },
  dock: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  hidden: { display: 'none' },
  pill: {
    height: TabBarHeight,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 7,
    borderRadius: Radius.pill,
    backgroundColor: Colors.forest,
    ...Shadow.float,
  },
  tab: { width: 50, height: 50, alignItems: 'center', justifyContent: 'center' },
  disc: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, borderRadius: 25, backgroundColor: Colors.paper },
});
