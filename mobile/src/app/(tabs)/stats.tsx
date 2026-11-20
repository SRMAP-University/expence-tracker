import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { CategoryBars } from '@/components/category-bars';
import { Dial } from '@/components/dial';
import { DotChart } from '@/components/dot-chart';
import { InsightsCard } from '@/components/insights-card';
import { CountUpMoney, Rise } from '@/components/motion';
import { NotchCard } from '@/components/notch-card';
import { AppText, Badge, Card, CoinBadge, Divider, IconBubble, Screen, ScreenTitle, SectionHeader } from '@/components/ui';
import { Colors, Font, MaxContentWidth } from '@/constants/theme';
import { useLedger } from '@/hooks/use-ledger';
import {
  cumulativeSeries,
  detectRecurring,
  monthlyEquivalent,
  monthlyTotals,
  summarizeMonth,
  type Metric,
} from '@/lib/analytics';
import { formatMoney, formatMonth, monthKey, percentChange, shiftMonth } from '@/lib/format';

export default function StatsScreen() {
  const { width } = useWindowDimensions();
  const { transactions, currency } = useLedger();

  const currentMonth = monthKey(new Date());
  const [month, setMonth] = useState(currentMonth);
  const [metric, setMetric] = useState<Metric>('spent');

  const summary = useMemo(() => summarizeMonth(transactions, month, currency), [transactions, month, currency]);
  const previous = useMemo(
    () => summarizeMonth(transactions, shiftMonth(month, -1), currency),
    [transactions, month, currency]
  );
  const series = useMemo(
    () => cumulativeSeries(transactions, month, currency, metric),
    [transactions, month, currency, metric]
  );
  const trend = useMemo(() => monthlyTotals(transactions, currency, 6), [transactions, currency]);
  const recurring = useMemo(
    () => detectRecurring(transactions).filter((r) => r.currency === currency),
    [transactions, currency]
  );

  const monthName = formatMonth(month).split(' ')[0];
  const amounts = { spent: summary.spent, income: summary.income, saved: summary.net };
  const previousAmounts = { spent: previous.spent, income: previous.income, saved: previous.net };
  const change = percentChange(amounts[metric], previousAmounts[metric]);
  // Spending less is good; earning or keeping more is good.
  const changeIsGood = change === null || (metric === 'spent' ? change <= 0 : change >= 0);
  const caption =
    metric === 'spent'
      ? `Spent in ${monthName}`
      : metric === 'income'
        ? `Earned in ${monthName}`
        : `${summary.net < 0 ? 'Overspent' : 'Left over'} in ${monthName}`;

  // The dark card carries the other headline number, so the two never repeat each other.
  const side =
    metric === 'income'
      ? { label: 'Spent', amount: summary.spent, change: percentChange(summary.spent, previous.spent), goodWhenUp: false }
      : { label: 'Income', amount: summary.income, change: percentChange(summary.income, previous.income), goodWhenUp: true };
  const sideIsGood = side.change === null || (side.goodWhenUp ? side.change >= 0 : side.change <= 0);

  const dialSize = Math.min(width, MaxContentWidth) - 56;

  return (
    <Screen>
      <Rise>
        <ScreenTitle title={'Your Spending\nOverview'} subtitle={`Spending, income and what’s left · ${formatMonth(month)}`} />
      </Rise>

      <Rise index={1} style={styles.dial}>
        <Dial
          size={Math.min(dialSize, 340)}
          series={series}
          amount={amounts[metric]}
          negative={metric === 'saved' && summary.net < 0}
          currency={currency}
          caption={caption}
          change={change}
          changeIsGood={changeIsGood}
          metric={metric}
          onMetric={setMetric}
          onPrevMonth={() => setMonth(shiftMonth(month, -1))}
          onNextMonth={() => setMonth(shiftMonth(month, 1))}
          canGoNext={month < currentMonth}
        />
      </Rise>

      <Rise index={2}>
        <NotchCard color={Colors.forest} style={styles.side}>
          <View style={styles.sideTop}>
            <CoinBadge currency={currency} />
            <Text style={[styles.onForest, styles.fill]}>{side.label}</Text>
            <Text style={styles.onForestMuted}>{monthName}</Text>
          </View>
          <View style={styles.sideBottom}>
            <View style={styles.sideDelta}>
              {side.change !== null && (
                <Badge
                  label={`${side.change >= 0 ? '+' : '−'}${Math.abs(Math.round(side.change))}%`}
                  tone={sideIsGood ? 'lime' : 'negative'}
                />
              )}
              <Text style={styles.onForestMuted}>{side.change !== null ? 'vs last month' : 'this month'}</Text>
            </View>
            <CountUpMoney
              amount={side.amount}
              currency={currency}
              size={34}
              color={Colors.onForest}
              symbolColor={Colors.onForestMuted}
              style={styles.sideAmount}
            />
          </View>
        </NotchCard>
      </Rise>

      <Rise index={3}>
        <Card style={styles.stats}>
          <View style={styles.statsHeader}>
            <View style={styles.fill}>
              <AppText variant="label">Statistics</AppText>
              <AppText variant="caption" color="textSecondary">
                Spending, last 6 months
              </AppText>
            </View>
            <AppText variant="label">{formatMoney(summary.spent, currency, { compact: true })}</AppText>
          </View>
          <DotChart data={trend} selected={month} currency={currency} onSelect={setMonth} />
        </Card>
      </Rise>

      {summary.byCategory.length > 0 && (
        <Rise index={4} style={styles.section}>
          <SectionHeader title="Where it went" />
          {/* Keyed by month so the bars grow in again when the month changes. */}
          <Card key={month}>
            <CategoryBars
              data={summary.byCategory}
              total={summary.spent}
              currency={currency}
              onSelect={(category) => router.navigate({ pathname: '/transactions', params: { category, month } })}
            />
          </Card>
        </Rise>
      )}

      {recurring.length > 0 && (
        <Rise index={5} style={styles.section}>
          <SectionHeader title="Recurring payments" />
          <Card padded={false}>
            {recurring.slice(0, 5).map((r, i) => (
              <View key={`${r.merchant}-${i}`}>
                {i > 0 && <Divider inset={16} />}
                <View style={styles.recurringRow}>
                  <IconBubble category={r.category} />
                  <View style={styles.fill}>
                    <AppText variant="body" numberOfLines={1} style={styles.semibold}>
                      {r.merchant}
                    </AppText>
                    <AppText variant="caption" color="textSecondary">
                      {r.cadence} · next ~
                      {new Date(r.nextDate).toLocaleDateString('en-US', { day: 'numeric', month: 'short' })}
                    </AppText>
                  </View>
                  <Text style={styles.rowAmount}>{formatMoney(r.amount, r.currency)}</Text>
                </View>
              </View>
            ))}
            <View style={styles.recurringFooter}>
              <AppText variant="caption" color="textSecondary" style={styles.fill}>
                Recurring each month, roughly
              </AppText>
              <Badge
                label={formatMoney(
                  recurring.reduce((sum, r) => sum + monthlyEquivalent(r), 0),
                  currency,
                  { compact: true }
                )}
              />
            </View>
          </Card>
        </Rise>
      )}

      <Rise index={6}>
        <InsightsCard month={month} hasTransactions={summary.count > 0} />
      </Rise>
    </Screen>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  semibold: { fontFamily: Font.semibold },
  dial: { paddingTop: 4 },
  section: { gap: 12 },
  // Top padding clears the notch recess.
  side: { paddingTop: 24, paddingHorizontal: 18, paddingBottom: 18, gap: 18 },
  sideTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sideBottom: { flexDirection: 'row', alignItems: 'flex-end', gap: 12 },
  sideDelta: { gap: 4 },
  sideAmount: { flex: 1, justifyContent: 'flex-end' },
  onForest: { fontFamily: Font.semibold, fontSize: 15, color: Colors.onForest },
  onForestMuted: { fontFamily: Font.medium, fontSize: 12, color: Colors.onForestMuted },
  stats: { gap: 18 },
  statsHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  recurringRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12 },
  rowAmount: { fontFamily: Font.semibold, fontSize: 15, color: Colors.text },
  recurringFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.border,
  },
});
