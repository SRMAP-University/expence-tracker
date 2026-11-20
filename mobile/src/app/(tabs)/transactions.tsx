import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { RefreshControl, ScrollView, SectionList, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PageSpring } from '@/components/bouncy';
import { Icon } from '@/components/icon';
import { TransactionRow } from '@/components/transaction-row';
import { AppText, Backdrop, Chip, IconButton, ScreenTitle, Segmented, useTabBarClearance } from '@/components/ui';
import { Colors, Font, MaxContentWidth, Radius, Shadow, Spacing } from '@/constants/theme';
import { useLedger } from '@/hooks/use-ledger';
import { useSync } from '@/hooks/use-sync';
import { formatDay, formatMoney, formatMonth, monthKey } from '@/lib/format';
import { isCategory } from '@/lib/sms-parser';
import { canSync } from '@/lib/sync';
import { NEUTRAL_CATEGORIES, type Category, type Transaction } from '@/lib/types';

type TypeFilter = 'all' | 'debit' | 'credit';

const TYPE_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: 'debit', label: 'Spent' },
  { value: 'credit', label: 'Received' },
] as const;
type Filters = { category?: string; month?: string; type?: string };

export default function TransactionsScreen() {
  // Filters live in the route params, so the Overview can deep-link straight into a filtered list.
  const params = useLocalSearchParams<Filters>();
  const { transactions, currency } = useLedger();
  const { running, runSmsSync } = useSync();
  const clearance = useTabBarClearance();
  const [query, setQuery] = useState('');

  const category: Category | null = isCategory(params.category) ? params.category : null;
  const month = params.month || null;
  const type: TypeFilter = params.type === 'debit' || params.type === 'credit' ? params.type : 'all';
  const setFilters = (next: Filters) => router.setParams(next);

  const categoriesInUse = useMemo(() => {
    const counts = new Map<Category, number>();
    for (const t of transactions) counts.set(t.category, (counts.get(t.category) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([c]) => c);
  }, [transactions]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return transactions.filter(
      (t) =>
        (type === 'all' || t.type === type) &&
        (!category || t.category === category) &&
        (!month || monthKey(t.date) === month) &&
        (!q ||
          t.merchant.toLowerCase().includes(q) ||
          t.category.toLowerCase().includes(q) ||
          (t.note ?? '').toLowerCase().includes(q) ||
          (t.account ?? '').toLowerCase().includes(q))
    );
  }, [transactions, query, type, category, month]);

  const sections = useMemo(() => {
    const groups = new Map<string, Transaction[]>();
    for (const t of filtered) {
      const key = new Date(t.date).toDateString();
      const list = groups.get(key) ?? [];
      list.push(t);
      groups.set(key, list);
    }
    return [...groups.values()].map((data) => {
      const net = data
        .filter((t) => t.currency === currency && !NEUTRAL_CATEGORIES.includes(t.category))
        .reduce((sum, t) => sum + (t.type === 'credit' ? t.amount : -t.amount), 0);
      return { title: formatDay(data[0].date), net, data };
    });
  }, [filtered, currency]);

  const totalSpent = useMemo(
    () =>
      filtered
        .filter((t) => t.currency === currency && t.type === 'debit' && !NEUTRAL_CATEGORIES.includes(t.category))
        .reduce((sum, t) => sum + t.amount, 0),
    [filtered, currency]
  );

  const hasFilters = !!(category || month || type !== 'all' || query);
  const clearFilters = () => {
    setQuery('');
    setFilters({ category: undefined, month: undefined, type: undefined });
  };

  const subtitle = hasFilters
    ? `${filtered.length} transaction${filtered.length === 1 ? '' : 's'} · ${formatMoney(totalSpent, currency)} spent`
    : 'Every alert, read and categorised';

  return (
    <View style={styles.screen}>
      <Backdrop />
      <SafeAreaView edges={['top']} style={styles.fill}>
        <PageSpring>
        <View style={styles.top}>
          <ScreenTitle
            title="Activity"
            subtitle={subtitle}
            right={<IconButton icon="plus" label="Add manually" onPress={() => router.push('/add')} />}
          />
          <View style={styles.search}>
            <Icon name="search" size={18} color={Colors.textSecondary} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Search merchants, categories, accounts"
              placeholderTextColor={Colors.textTertiary}
              style={styles.searchInput}
              returnKeyType="search"
              autoCorrect={false}
              accessibilityLabel="Search transactions"
            />
          </View>
          <Segmented
            options={TYPE_OPTIONS}
            value={type}
            onChange={(next) => setFilters({ type: next === 'all' ? undefined : next })}
          />
        </View>

        <View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
            {hasFilters && <Chip label="Clear" onPress={clearFilters} />}
            {month && <Chip label={`${formatMonth(month)} ✕`} selected onPress={() => setFilters({ month: undefined })} />}
            {categoriesInUse.map((c) => (
              <Chip
                key={c}
                label={c}
                selected={category === c}
                onPress={() => setFilters({ category: category === c ? undefined : c })}
              />
            ))}
          </ScrollView>
        </View>

        <SectionList
          sections={sections}
          keyExtractor={(t) => t.id}
          renderItem={({ item, index, section }) => (
            <TransactionRow txn={item} grouped={{ first: index === 0, last: index === section.data.length - 1 }} />
          )}
          renderSectionHeader={({ section }) => (
            <View style={styles.sectionHeader}>
              <AppText variant="label" color="textSecondary">
                {section.title}
              </AppText>
              <Text style={styles.sectionNet}>
                {section.net >= 0 ? '+' : '−'}
                {formatMoney(Math.abs(section.net), currency)}
              </Text>
            </View>
          )}
          stickySectionHeadersEnabled={false}
          showsVerticalScrollIndicator={false}
          initialNumToRender={20}
          contentContainerStyle={[styles.listContent, { paddingBottom: clearance }]}
          style={styles.list}
          refreshControl={
            canSync ? (
              <RefreshControl refreshing={running === 'sms'} onRefresh={runSmsSync} tintColor={Colors.accent} />
            ) : undefined
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <AppText variant="body" color="textSecondary" style={styles.center}>
                {transactions.length === 0
                  ? 'No transactions yet. Sync or paste your bank messages from Overview.'
                  : 'Nothing matches these filters.'}
              </AppText>
            </View>
          }
        />
        </PageSpring>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.background },
  fill: { flex: 1 },
  center: { textAlign: 'center' },
  top: {
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.two,
    gap: 14,
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
  },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: Radius.pill,
    backgroundColor: Colors.card,
    paddingHorizontal: 18,
    minHeight: 50,
    ...Shadow.card,
  },
  searchInput: { flex: 1, fontFamily: Font.medium, fontSize: 15, color: Colors.text, paddingVertical: 12 },
  chips: { gap: 8, paddingHorizontal: Spacing.three, paddingVertical: 14, alignItems: 'center' },
  list: { width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center' },
  listContent: { paddingHorizontal: Spacing.three },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    paddingHorizontal: 6,
    paddingTop: 14,
    paddingBottom: 8,
  },
  sectionNet: { fontFamily: Font.semibold, fontSize: 13, color: Colors.textSecondary },
  empty: { padding: Spacing.five },
});
