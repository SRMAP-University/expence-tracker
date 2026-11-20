import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { SectionList, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { PageSpring } from '@/components/bouncy';
import { ACCOUNT_GLYPH_NAME } from '@/components/icon';
import { CountUpMoney, Rise } from '@/components/motion';
import { NotchCard } from '@/components/notch-card';
import { TransactionRow } from '@/components/transaction-row';
import { AppText, Backdrop, Badge, Card, IconBubble, IconButton, Segmented } from '@/components/ui';
import { Colors, Font, MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useLedger } from '@/hooks/use-ledger';
import { formatDay, formatMoney, formatRelative, monthKey } from '@/lib/format';
import { goBack } from '@/lib/nav';
import { ACCOUNT_KIND_LABEL, type Transaction } from '@/lib/types';

type TypeFilter = 'all' | 'debit' | 'credit';

const TYPE_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: 'debit', label: 'Money out' },
  { value: 'credit', label: 'Money in' },
] as const;

const SOURCE_NOTE = { sms: 'from a bank message', api: 'from Binance', manual: 'set by you' } as const;

function currentMonthKey() {
  return monthKey(new Date().toISOString());
}

/** One account's page: its balance, this month's flow, and every transaction filed under it. */
export default function AccountHistoryScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { transactions, accounts, currency } = useLedger();
  const account = accounts.find((a) => a.id === id);
  const insets = useSafeAreaInsets();
  const [type, setType] = useState<TypeFilter>('all');

  // Removed from its edit drawer: nothing left to show here.
  useEffect(() => {
    if (!account) goBack('/accounts');
  }, [account]);

  // Its own transactions, plus transfers into it from another account. Those were recorded from
  // the other side, so their direction is flipped to read as this account sees it.
  const own = useMemo(
    () =>
      transactions
        .filter((t) => t.accountId === id || t.toAccountId === id)
        .map((t): Transaction => (t.accountId === id ? t : { ...t, type: t.type === 'debit' ? 'credit' : 'debit' })),
    [transactions, id]
  );

  const month = currentMonthKey();
  const thisMonth = useMemo(() => {
    let moneyIn = 0;
    let moneyOut = 0;
    for (const t of own) {
      if (t.currency !== currency || monthKey(t.date) !== month) continue;
      if (t.type === 'credit') moneyIn += t.amount;
      else moneyOut += t.amount;
    }
    return { moneyIn, moneyOut };
  }, [own, currency, month]);

  const sections = useMemo(() => {
    const groups = new Map<string, Transaction[]>();
    for (const t of own) {
      if (type !== 'all' && t.type !== type) continue;
      const key = new Date(t.date).toDateString();
      const list = groups.get(key) ?? [];
      list.push(t);
      groups.set(key, list);
    }
    return [...groups.values()].map((data) => ({
      title: formatDay(data[0].date),
      net: data
        .filter((t) => t.currency === currency)
        .reduce((sum, t) => sum + (t.type === 'credit' ? t.amount : -t.amount), 0),
      data,
    }));
  }, [own, type, currency]);

  if (!account) return null;

  const isCard = account.kind === 'card';
  const cards = account.cards ?? [];

  const header = (
    <View style={styles.header}>
      <Rise index={0}>
        <NotchCard color={Colors.forest} notch="both" radius={32} style={styles.hero}>
          <View style={styles.heroTop}>
            <IconBubble name={ACCOUNT_GLYPH_NAME[account.kind]} tone="lime" size={40} />
            <View style={styles.fill}>
              <Text style={styles.heroName} numberOfLines={1}>
                {account.name}
              </Text>
              <Text style={styles.heroKind} numberOfLines={1}>
                {ACCOUNT_KIND_LABEL[account.kind]}
                {account.last4 ? ` · ••${account.last4}` : ''}
              </Text>
            </View>
          </View>
          <Text style={styles.heroLabel}>{isCard ? 'Amount owed' : 'Balance'}</Text>
          <CountUpMoney
            amount={account.balance}
            currency={account.currency}
            size={40}
            color={Colors.onForest}
            symbolColor={Colors.onForestMuted}
          />
          <Text style={styles.heroNote}>
            {account.original ? `${formatMoney(account.original.balance, account.original.currency)} · ` : ''}
            {SOURCE_NOTE[account.balanceSource]} {formatRelative(account.balanceUpdatedAt)}
          </Text>
        </NotchCard>
      </Rise>

      <Rise index={1} style={styles.tiles}>
        <Card style={styles.tile}>
          <AppText variant="caption" color="textSecondary">
            In this month
          </AppText>
          <Text style={styles.tileAmount}>+{formatMoney(thisMonth.moneyIn, currency)}</Text>
        </Card>
        <Card style={styles.tile}>
          <AppText variant="caption" color="textSecondary">
            Out this month
          </AppText>
          <Text style={styles.tileAmount}>−{formatMoney(thisMonth.moneyOut, currency)}</Text>
        </Card>
      </Rise>

      {cards.length > 0 && (
        <Rise index={2} style={styles.cards}>
          {cards.map((c) => (
            <Badge
              key={c.id}
              tone="white"
              label={`${c.label} · ${c.type === 'credit' ? 'Credit' : 'Debit'} ••${c.last4}`}
              style={styles.cardBadge}
            />
          ))}
        </Rise>
      )}

      <Rise index={3}>
        <Segmented options={TYPE_OPTIONS} value={type} onChange={setType} />
      </Rise>
    </View>
  );

  return (
    <View style={styles.screen}>
      <Backdrop />
      <SafeAreaView edges={['top']} style={styles.fill}>
        <View style={styles.topBar}>
          <IconButton icon="back" label="Back" onPress={() => goBack('/accounts')} />
          <AppText variant="heading" style={styles.topTitle} numberOfLines={1} accessibilityRole="header">
            {account.name}
          </AppText>
          <IconButton
            icon="edit"
            label="Edit account"
            onPress={() => router.push({ pathname: '/account/[id]', params: { id: account.id } })}
          />
        </View>
        <PageSpring>
          <SectionList
            sections={sections}
            keyExtractor={(t) => t.id}
            ListHeaderComponent={header}
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
            ListEmptyComponent={
              <AppText variant="body" color="textSecondary" style={styles.empty}>
                {own.length === 0
                  ? 'No transactions for this account yet. Bank alerts are linked by its last 4 digits or its cards’.'
                  : 'Nothing here for this filter.'}
              </AppText>
            }
            stickySectionHeadersEnabled={false}
            showsVerticalScrollIndicator={false}
            initialNumToRender={20}
            style={styles.list}
            contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + Spacing.five }]}
          />
        </PageSpring>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.background },
  fill: { flex: 1 },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
  },
  topTitle: { flex: 1, textAlign: 'center' },
  list: { width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center' },
  listContent: { paddingHorizontal: Spacing.three },
  header: { gap: 14, paddingTop: Spacing.one, paddingBottom: Spacing.two },
  hero: { gap: 6, paddingVertical: 24, paddingHorizontal: 22 },
  heroTop: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 10 },
  heroName: { fontFamily: Font.semibold, fontSize: 17, color: Colors.onForest },
  heroKind: { fontFamily: Font.medium, fontSize: 13, color: Colors.onForestMuted },
  heroLabel: { fontFamily: Font.medium, fontSize: 13, color: Colors.onForestMuted },
  heroNote: { fontFamily: Font.medium, fontSize: 12, color: Colors.onForestMuted },
  tiles: { flexDirection: 'row', gap: 10 },
  tile: { flex: 1, gap: 4, paddingVertical: 14, paddingHorizontal: 16 },
  tileAmount: { fontFamily: Font.semibold, fontSize: 18, color: Colors.text },
  cards: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  cardBadge: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: Radius.pill },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    paddingHorizontal: 6,
    paddingTop: 14,
    paddingBottom: 8,
  },
  sectionNet: { fontFamily: Font.semibold, fontSize: 13, color: Colors.textSecondary },
  empty: { textAlign: 'center', padding: Spacing.four },
});
