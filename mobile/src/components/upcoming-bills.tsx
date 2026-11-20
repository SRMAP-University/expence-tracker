import { router } from 'expo-router';
import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Colors, Font } from '@/constants/theme';
import { findBills, dueLabel, type Bill } from '@/lib/bills';
import { formatMoney } from '@/lib/format';
import type { Transaction } from '@/lib/types';

import { Bouncy } from './bouncy';
import { AppText, Card, Divider, IconBubble, SectionHeader } from './ui';

/** Bills due within this many days show on Home. */
const SOON_DAYS = 14;

function soonBills(transactions: Transaction[]) {
  return findBills(transactions, new Date())
    .filter((b) => b.status === 'late' || (b.status === 'upcoming' && b.dueInDays <= SOON_DAYS))
    .slice(0, 3);
}

/** Home: the next few bills and subscriptions, and anything that looks late. */
export function UpcomingBills({ transactions }: { transactions: Transaction[] }) {
  const bills = useMemo(() => soonBills(transactions), [transactions]);
  if (!bills.length) return null;

  return (
    <View style={styles.section}>
      <SectionHeader title="Upcoming bills" action={{ label: 'See all', onPress: () => router.push('/bills') }} />
      <Card padded={false}>
        {bills.map((bill, i) => (
          <View key={`${bill.merchant}-${bill.currency}`}>
            {i > 0 && <Divider inset={16} />}
            <BillRow bill={bill} />
          </View>
        ))}
      </Card>
    </View>
  );
}

export function BillRow({ bill }: { bill: Bill }) {
  const late = bill.status === 'late';
  return (
    <Bouncy
      scaleTo={0.98}
      onPress={() => router.push('/bills')}
      accessibilityRole="button"
      accessibilityLabel={`${bill.merchant}, ${formatMoney(bill.amount, bill.currency)}, ${dueLabel(bill)}`}
      style={styles.row}>
      <IconBubble category={bill.category} tone={late ? 'white' : 'mint'} size={38} />
      <View style={styles.fill}>
        <AppText variant="body" numberOfLines={1} style={styles.name}>
          {bill.merchant}
        </AppText>
        <AppText variant="caption" color={late ? 'negative' : 'textSecondary'} numberOfLines={1}>
          {dueLabel(bill)}
        </AppText>
      </View>
      <Text style={styles.amount}>{formatMoney(bill.amount, bill.currency)}</Text>
    </Bouncy>
  );
}

const styles = StyleSheet.create({
  section: { gap: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 16 },
  fill: { flex: 1 },
  name: { fontFamily: Font.semibold },
  amount: { fontFamily: Font.semibold, fontSize: 15, color: Colors.text },
});
