import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { Colors, Font } from '@/constants/theme';
import { useSync } from '@/hooks/use-sync';
import { useApiKey } from '@/lib/api-key';
import { formatMonth, formatRelative, percentChange } from '@/lib/format';
import { useStore } from '@/lib/store';
import { canSync } from '@/lib/sync';

import { CountUpMoney } from './motion';
import { NotchCard } from './notch-card';
import { AppText, Badge, Button, IconBubble } from './ui';

/**
 * The feature card: where the numbers come from (bank messages), the month's spend,
 * and the two ways to bring more messages in.
 */
export function BalanceCard({
  month,
  spent,
  previousSpent,
  currency,
}: {
  month: string;
  spent: number;
  previousSpent: number;
  currency: string;
}) {
  const { running, progress, runSmsSync } = useSync();
  const lastSmsSyncAt = useStore((s) => s.lastSmsSyncAt);
  const hasKey = useApiKey((s) => s.hasKey);
  const change = percentChange(spent, previousSpent);


  const status = running
    ? progress && progress.total > 0
      ? `${progress.label}… ${Math.min(progress.done, progress.total)}/${progress.total}`
      : `${progress?.label ?? 'Working'}…`
    : lastSmsSyncAt
      ? `Synced ${formatRelative(lastSmsSyncAt)}`
      : canSync
        ? 'Not synced yet'
        : 'Paste alerts to import them';

  return (
    <NotchCard color={Colors.forest} radius={32} style={styles.card}>
      <View style={styles.strip}>
        <IconBubble name="sms" tone="white" size={30} />
        <View style={styles.stripText}>
          <AppText variant="label" color="onLime">Messages & alerts</AppText>
          <Text style={styles.stripStatus} numberOfLines={1}>
            {status}
          </Text>
        </View>
        {hasKey !== null && <Badge label={hasKey ? 'AI on' : 'No AI key'} tone={hasKey ? 'forest' : 'white'} />}
      </View>

      <View style={styles.panel}>
        <CountUpMoney
          amount={spent}
          currency={currency}
          size={32}
          color={Colors.onForest}
          symbolColor={Colors.onForestMuted}
        />
        <View style={styles.captionRow}>
          <Text style={styles.caption}>Spent in {formatMonth(month)}</Text>
          {change !== null && (
            <Badge
              label={`${change > 0 ? '+' : '−'}${Math.abs(Math.round(change))}%`}
              tone={change > 0 ? 'negative' : 'lime'}
            />
          )}
        </View>
      </View>

      <View style={styles.actions}>
        <Button
          label={canSync ? 'Paste' : 'Paste messages'}
          icon="paste"
          variant={canSync ? 'onDarkOutline' : 'onDark'}
          onPress={() => router.push('/import')}
          disabled={!!running}
          compact
          style={styles.action}
        />
        {canSync && (
          <Button
            label={running === 'sms' ? 'Syncing' : 'Sync'}
            icon="sync"
            variant="onDark"
            onPress={runSmsSync}
            loading={running === 'sms'}
            disabled={!!running}
            compact
            style={styles.action}
          />
        )}
      </View>
    </NotchCard>
  );
}

const styles = StyleSheet.create({
  // Top padding clears the notch recess.
  card: { paddingTop: 18, paddingHorizontal: 10, paddingBottom: 10, gap: 8 },
  strip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 7,
    paddingRight: 12,
    borderRadius: 20,
    backgroundColor: Colors.lime,
  },
  stripText: { flex: 1, minWidth: 0 },
  stripStatus: { fontFamily: Font.medium, fontSize: 12, lineHeight: 16, color: Colors.onLimeMuted },
  panel: {
    alignItems: 'center',
    gap: 2,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 18,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: Colors.onForestLine,
  },
  captionRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  caption: { fontFamily: Font.medium, fontSize: 13, color: Colors.onForestMuted },
  actions: { flexDirection: 'row', gap: 8 },
  action: { flex: 1 },
});
