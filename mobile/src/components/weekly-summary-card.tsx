import { StyleSheet, View } from 'react-native';

import { Colors } from '@/constants/theme';

import { formatMoney } from '@/lib/format';
import { useStore } from '@/lib/store';
import { lastWeek } from '@/lib/weekly';

import { AppText, Badge, Card, IconBubble, IconButton } from './ui';

function isCurrent(weekStart: string) {
  return lastWeek(new Date()).key === weekStart;
}

function shortDate(day: string) {
  return new Date(`${day}T12:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

/** Home: the AI's look back at last week, until it is dismissed or a new week starts. */
export function WeeklySummaryCard() {
  const summary = useStore((s) => s.weeklySummary);
  const setWeeklySummary = useStore((s) => s.setWeeklySummary);
  if (!summary || summary.dismissed || !isCurrent(summary.weekStart)) return null;

  const diff = summary.usualWeeklySpend > 0 ? (summary.spent - summary.usualWeeklySpend) / summary.usualWeeklySpend : null;
  const pct = diff !== null ? Math.round(Math.abs(diff) * 100) : null;

  return (
    <Card style={styles.card}>
      <View style={styles.header}>
        <IconBubble name="sparkle" tone="lime" size={36} />
        <View style={styles.fill}>
          <AppText variant="label">Your week</AppText>
          <AppText variant="caption" color="textSecondary">
            {shortDate(summary.weekStart)} – {shortDate(summary.weekEnd)} · spent{' '}
            {formatMoney(summary.spent, summary.currency)}
          </AppText>
        </View>
        {pct !== null && pct > 0 && (
          <Badge label={`${diff! > 0 ? '+' : '−'}${pct}% vs usual`} tone={diff! > 0 ? 'negative' : 'lime'} />
        )}
        <IconButton
          icon="close"
          label="Hide this week's summary"
          tone="mint"
          size={30}
          onPress={() => setWeeklySummary({ ...summary, dismissed: true })}
        />
      </View>
      <AppText variant="heading">{summary.headline}</AppText>
      {summary.points.map((p) => (
        <View key={p} style={styles.point}>
          <View style={styles.dot} />
          <AppText variant="caption" color="textSecondary" style={styles.fill}>
            {p}
          </AppText>
        </View>
      ))}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: 10 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  fill: { flex: 1 },
  point: { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
  dot: { width: 5, height: 5, borderRadius: 3, marginTop: 7, backgroundColor: Colors.limeDeep },
});
