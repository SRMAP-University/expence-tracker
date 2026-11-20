import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Icon } from '@/components/icon';
import { AppText, Backdrop, Banner, Card, Divider, Input, ModalHeader, SectionHeader } from '@/components/ui';
import { Colors, Font, MaxContentWidth, Spacing } from '@/constants/theme';
import { canReadNotifications } from '@/lib/sync';

import {
  getWatchedPackages,
  listInstalledApps,
  setWatchedPackages,
  type InstalledApp,
} from '../../modules/sms-reader/notifications';

/** Names that suggest an app sends money alerts: banks, payment and crypto apps, and email. */
const FINANCE_HINT =
  /bank|pay|upi|wallet|stripe|revolut|mercury|binance|coin|crypto|wise|cred|money|financ|invest|trading|broker|zerodha|groww|kite|card|loan|razorpay|mail|outlook/i;

function AppRow({ app, selected, onToggle }: { app: InstalledApp; selected: boolean; onToggle: () => void }) {
  return (
    <Pressable
      onPress={onToggle}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected }}
      accessibilityLabel={app.label}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
      <View style={styles.rowText}>
        <Text style={styles.name} numberOfLines={1}>
          {app.label}
        </Text>
        <Text style={styles.package} numberOfLines={1}>
          {app.packageName}
        </Text>
      </View>
      <View style={[styles.check, selected && styles.checkOn]}>
        {selected && <Icon name="check" size={14} color={Colors.onForest} />}
      </View>
    </Pressable>
  );
}

function AppList({
  title,
  apps,
  watched,
  onToggle,
}: {
  title: string;
  apps: InstalledApp[];
  watched: Set<string>;
  onToggle: (packageName: string) => void;
}) {
  if (apps.length === 0) return null;
  return (
    <View style={styles.section}>
      <SectionHeader title={title} />
      <Card padded={false} style={styles.list}>
        {apps.map((app, i) => (
          <View key={app.packageName}>
            {i > 0 && <Divider inset={16} />}
            <AppRow app={app} selected={watched.has(app.packageName)} onToggle={() => onToggle(app.packageName)} />
          </View>
        ))}
      </Card>
    </View>
  );
}

export default function WatchAppsScreen() {
  const [apps, setApps] = useState<InstalledApp[] | null>(null);
  const [watchedList, setWatchedList] = useState<string[]>(() => getWatchedPackages());
  const [query, setQuery] = useState('');

  useEffect(() => {
    let alive = true;
    listInstalledApps()
      .then((list) => alive && setApps(list))
      .catch(() => alive && setApps([]));
    return () => {
      alive = false;
    };
  }, []);

  const watched = useMemo(() => new Set(watchedList), [watchedList]);

  function toggle(packageName: string) {
    const next = watched.has(packageName)
      ? watchedList.filter((p) => p !== packageName)
      : [...watchedList, packageName];
    setWatchedList(next);
    setWatchedPackages(next);
  }

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matches = (apps ?? []).filter(
      (a) => !q || a.label.toLowerCase().includes(q) || a.packageName.toLowerCase().includes(q)
    );
    const likely = (a: InstalledApp) => FINANCE_HINT.test(a.label) || FINANCE_HINT.test(a.packageName);
    return {
      watching: matches.filter((a) => watched.has(a.packageName)),
      likely: matches.filter((a) => !watched.has(a.packageName) && likely(a)),
      others: matches.filter((a) => !watched.has(a.packageName) && !likely(a)),
    };
  }, [apps, query, watched]);

  return (
    <View style={styles.screen}>
      <Backdrop />
      <SafeAreaView edges={['top', 'bottom']} style={styles.fill}>
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>
          <ModalHeader
            title="Apps to Watch"
            subtitle="Only notifications from the apps you tick are read. Everything else is ignored."
          />

          {!canReadNotifications ? (
            <Banner tone="info" message="Notification reading needs the latest app build installed on an Android phone." />
          ) : apps === null ? (
            <ActivityIndicator color={Colors.accent} style={styles.loading} />
          ) : (
            <>
              <Input
                value={query}
                onChangeText={setQuery}
                placeholder="Search your apps"
                autoCorrect={false}
                autoCapitalize="none"
                style={styles.search}
                accessibilityLabel="Search your apps"
              />
              <AppList title={`Watching (${groups.watching.length})`} apps={groups.watching} watched={watched} onToggle={toggle} />
              <AppList title="Likely money apps" apps={groups.likely} watched={watched} onToggle={toggle} />
              <AppList title="Other apps" apps={groups.others} watched={watched} onToggle={toggle} />
              {groups.watching.length + groups.likely.length + groups.others.length === 0 && (
                <AppText variant="caption" color="textSecondary" style={styles.center}>
                  No apps match that search.
                </AppText>
              )}
              <AppText variant="caption" color="textSecondary" style={styles.note}>
                Tick your email app to pick up alerts that only arrive by email. The AI sees who each email is from,
                its subject and first lines, and ignores anything that is not a money movement.
              </AppText>
            </>
          )}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.background },
  fill: { flex: 1 },
  center: { textAlign: 'center' },
  content: {
    padding: Spacing.three,
    paddingBottom: Spacing.five,
    gap: Spacing.three,
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
  },
  loading: { paddingVertical: Spacing.five },
  search: { backgroundColor: Colors.card },
  section: { gap: 12 },
  list: { overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 10 },
  pressed: { backgroundColor: Colors.cardMuted },
  rowText: { flex: 1, minWidth: 0 },
  name: { fontFamily: Font.semibold, fontSize: 15, color: Colors.text },
  package: { fontFamily: Font.medium, fontSize: 12, color: Colors.textSecondary },
  check: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkOn: { backgroundColor: Colors.forest, borderColor: Colors.forest },
  note: { paddingHorizontal: 4 },
});
