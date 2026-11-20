import { router } from 'expo-router';
import { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Bouncy } from './bouncy';
import { Colors, Font, Radius } from '@/constants/theme';
import { formatSignedMoney } from '@/lib/format';
import { useStore } from '@/lib/store';
import type { Transaction } from '@/lib/types';

import { AppText, IconBubble } from './ui';

type Props = {
  txn: Transaction;
  showDate?: boolean;
  /** Draw the row as part of a white grouped card (used by the Activity list). */
  grouped?: { first: boolean; last: boolean };
};

function TransactionRowBase({ txn, showDate, grouped }: Props) {
  // A linked account's own name ("HDFC Savings") reads better than the bank's label ("HDFC ••4421").
  const accountName = useStore((s) => s.accounts.find((a) => a.id === txn.accountId)?.name);
  const subtitle = [
    txn.category,
    showDate ? new Date(txn.date).toLocaleDateString('en-US', { day: 'numeric', month: 'short' }) : null,
    accountName ?? txn.account,
  ]
    .filter(Boolean)
    .join(' · ');
  const amount = formatSignedMoney(txn.amount, txn.currency, txn.type);

  return (
    <Bouncy scaleTo={0.98}
      onPress={() => router.push({ pathname: '/transaction/[id]', params: { id: txn.id } })}
      accessibilityRole="button"
      accessibilityLabel={`${txn.merchant}, ${amount}, ${txn.category}`}
      style={[
        styles.row,
        grouped && styles.grouped,
        grouped?.first && styles.first,
        grouped?.last && styles.last]}>
      <IconBubble category={txn.category} tone={txn.type === 'credit' ? 'lime' : 'mint'} />
      <View style={styles.middle}>
        <AppText variant="body" numberOfLines={1} style={styles.merchant}>
          {txn.merchant}
        </AppText>
        <AppText variant="caption" color="textSecondary" numberOfLines={1}>
          {subtitle}
        </AppText>
      </View>
      <Text style={styles.amount}>{amount}</Text>
    </Bouncy>
  );
}

export const TransactionRow = memo(TransactionRowBase);

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11, paddingHorizontal: 16 },
  grouped: { backgroundColor: Colors.card },
  first: { borderTopLeftRadius: Radius.xl, borderTopRightRadius: Radius.xl, paddingTop: 16 },
  last: { borderBottomLeftRadius: Radius.xl, borderBottomRightRadius: Radius.xl, paddingBottom: 16 },
  middle: { flex: 1, minWidth: 0 },
  merchant: { fontFamily: Font.semibold },
  amount: { fontFamily: Font.semibold, fontSize: 15, color: Colors.text },
});
