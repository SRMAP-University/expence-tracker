import { router } from 'expo-router';
import { useMemo } from 'react';
import { RefreshControl, StyleSheet, Text, View } from 'react-native';

import { Bouncy } from '@/components/bouncy';
import { AccountsSummary } from '@/components/accounts-summary';
import { BalanceCard } from '@/components/balance-card';
import { Icon } from '@/components/icon';
import { CountUpMoney, Rise } from '@/components/motion';
import { SyncStatus } from '@/components/sync-status';
import { UpcomingBills } from '@/components/upcoming-bills';
import { WeeklySummaryCard } from '@/components/weekly-summary-card';
import { TransactionRow } from '@/components/transaction-row';
import {
  AppText,
  Badge,
  Button,
  Card,
  CoinBadge,
  IconBubble,
  IconButton,
  Screen,
  ScreenTitle,
  SectionHeader,
} from '@/components/ui';
import { Colors, Font, Spacing } from '@/constants/theme';
import { useLedger } from '@/hooks/use-ledger';
import { useSync } from '@/hooks/use-sync';
import { summarizeMonth } from '@/lib/analytics';
import { loadDemoData } from '@/lib/demo-data';
import { monthKey, percentChange, shiftMonth } from '@/lib/format';
import { useStore } from '@/lib/store';
import { canSync } from '@/lib/sync';

function greeting(name: string) {
  if (name.trim()) return `Hi ${name.trim()},`;
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning,';
  if (hour < 18) return 'Good afternoon,';
  return 'Good evening,';
}

export default function HomeScreen() {
  const { transactions, accounts, currency } = useLedger();
  const name = useStore((s) => s.settings.name);
  const { running, runSmsSync } = useSync();

  const month = monthKey(new Date());
  const summary = useMemo(() => summarizeMonth(transactions, month, currency), [transactions, month, currency]);
  const previous = useMemo(
    () => summarizeMonth(transactions, shiftMonth(month, -1), currency),
    [transactions, month, currency]
  );
  const recent = useMemo(() => transactions.slice(0, 6), [transactions]);
  const incomeChange = percentChange(summary.income, previous.income);
  const keptShare = summary.income > 0 ? Math.round((summary.net / summary.income) * 100) : null;

  return (
    <Screen
      refreshControl={
        canSync ? (
          <RefreshControl refreshing={running === 'sms'} onRefresh={runSmsSync} tintColor={Colors.accent} />
        ) : undefined
      }>
      <Rise style={styles.topBar}>
        <Text style={styles.wordmark}>expense.</Text>
        <View style={styles.topActions}>
          <IconButton icon="calculator" label="Calculator" onPress={() => router.push('/calculator')} />
          <IconButton icon="plus" label="Add manually" onPress={() => router.push('/add')} />
          <IconButton icon="settings" label="Settings" onPress={() => router.push('/settings')} />
        </View>
      </Rise>

      <Rise index={1}>
        <ScreenTitle eyebrow={greeting(name)} title="Welcome Back!" />
      </Rise>

      <Rise index={2}>
        <BalanceCard month={month} spent={summary.spent} previousSpent={previous.spent} currency={currency} />
      </Rise>

      <SyncStatus />

      {/* Every bank, platform and asset, right under the hero */}
      <Rise index={3}>
        <AccountsSummary accounts={accounts} currency={currency} />
      </Rise>

      <Rise index={3}>
        <WeeklySummaryCard />
      </Rise>

      <Rise index={3}>
        <UpcomingBills transactions={transactions} />
      </Rise>

      {transactions.length === 0 ? (
        <Rise index={4}>
          <Card style={styles.empty}>
            <IconBubble name="sms" tone="lime" size={52} />
            <AppText variant="heading" style={styles.center}>
              Nothing here yet
            </AppText>
            <AppText variant="caption" color="textSecondary" style={styles.center}>
              {canSync
                ? 'Tap Sync and each bank alert becomes a categorised transaction.'
                : 'Paste a few bank alerts and each one becomes a categorised transaction.'}
            </AppText>
            <Button label="Try it with demo data" variant="secondary" onPress={() => loadDemoData()} />
          </Card>
        </Rise>
      ) : (
        <>
          <Rise index={4} style={styles.tiles}>
            <Bouncy scaleTo={0.95}
              style={[styles.tilePress]}
              accessibilityRole="button"
              accessibilityLabel="Income this month. Opens received transactions."
              onPress={() => router.navigate({ pathname: '/transactions', params: { type: 'credit', month } })}>
              <Card style={styles.tile}>
                <View style={styles.tileHeader}>
                  <CoinBadge currency={currency} />
                  <AppText variant="label" style={styles.fill}>
                    Income
                  </AppText>
                  <Icon name="arrowOut" size={20} color={Colors.text} />
                </View>
                <View style={styles.tileBody}>
                  <CountUpMoney amount={summary.income} currency={currency} size={24} compact />
                  <View style={styles.tileCaption}>
                    <AppText variant="caption" color="textTertiary">
                      This month
                    </AppText>
                    {incomeChange !== null && (
                      <Badge
                        label={`${incomeChange >= 0 ? '+' : '−'}${Math.abs(Math.round(incomeChange))}%`}
                        tone={incomeChange >= 0 ? 'lime' : 'negative'}
                      />
                    )}
                  </View>
                </View>
              </Card>
            </Bouncy>

            <Bouncy scaleTo={0.95}
              style={[styles.tilePress]}
              accessibilityRole="button"
              accessibilityLabel="What is left this month. Opens the overview."
              onPress={() => router.navigate('/stats')}>
              <Card style={styles.tile}>
                <View style={styles.tileHeader}>
                  <AppText variant="label" style={styles.fill}>
                    {summary.net < 0 ? 'Overspent' : 'Left over'}
                  </AppText>
                  <Icon name="arrowOut" size={20} color={Colors.text} />
                </View>
                <View style={styles.tileBody}>
                  <CountUpMoney
                    amount={summary.net}
                    currency={currency}
                    size={24}
                    compact
                    sign={summary.net < 0 ? '−' : undefined}
                    color={summary.net < 0 ? Colors.negative : Colors.text}
                  />
                  <View style={styles.tileCaption}>
                    <AppText variant="caption" color="textTertiary">
                      This month
                    </AppText>
                    {keptShare !== null && keptShare > 0 && <Badge label={`${keptShare}%`} />}
                  </View>
                </View>
              </Card>
            </Bouncy>
          </Rise>

          {summary.otherCurrencyCount > 0 && (
            <AppText variant="caption" color="textSecondary" style={styles.note}>
              {summary.otherCurrencyCount} transaction{summary.otherCurrencyCount === 1 ? ' is' : 's are'} in a
              currency with no exchange rate, so not in these totals. Add a rate in Settings.
            </AppText>
          )}

          <Rise index={5} style={styles.section}>
            <SectionHeader
              title="Recent"
              action={{ label: 'See all', onPress: () => router.navigate('/transactions') }}
            />
            <Card padded={false} style={styles.recent}>
              {recent.map((t) => (
                <TransactionRow key={t.id} txn={t} showDate />
              ))}
            </Card>
          </Rise>
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  center: { textAlign: 'center' },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  topActions: { flexDirection: 'row', gap: 8 },
  wordmark: { fontFamily: Font.semibold, fontSize: 22, letterSpacing: -0.6, color: Colors.text },
  empty: { alignItems: 'center', gap: 12, paddingVertical: Spacing.four },
  tiles: { flexDirection: 'row', gap: 12 },
  tilePress: { flex: 1 },
  tile: { padding: 14, minHeight: 104, justifyContent: 'space-between' },
  tileHeader: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  tileBody: { gap: 2 },
  tileCaption: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  note: { paddingHorizontal: Spacing.one },
  section: { gap: 12 },
  recent: { paddingVertical: 6 },
});
