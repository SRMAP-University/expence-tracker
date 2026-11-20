import { useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { ChipRow, Drawer, FieldLabel, type DrawerHandle } from '@/components/drawer';
import { NotchCard } from '@/components/notch-card';
import { AppText, Badge, Button, Card, Chip, Divider, IconBubble, Money } from '@/components/ui';
import { Colors, Font } from '@/constants/theme';
import { useLedger } from '@/hooks/use-ledger';
import { confirmAction } from '@/lib/confirm';
import { formatDateTime, formatMoney } from '@/lib/format';
import { useStore } from '@/lib/store';
import { CATEGORIES } from '@/lib/types';

const SOURCE_LABEL = {
  sms: 'SMS',
  notification: 'App notification',
  email: 'Email',
  binance: 'Binance',
  paste: 'Pasted',
  demo: 'Demo data',
  manual: 'Added by you',
} as const;

export default function TransactionDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const ledger = useLedger();
  const txn = ledger.transactions.find((t) => t.id === id);
  const account = ledger.accounts.find((a) => a.id === txn?.accountId);
  const toAccount = ledger.accounts.find((a) => a.id === txn?.toAccountId);
  const setCategory = useStore((s) => s.setCategory);
  const deleteTransaction = useStore((s) => s.deleteTransaction);
  const drawer = useRef<DrawerHandle>(null);
  const [showOriginal, setShowOriginal] = useState(false);
  // The current category leads the row, so it is in view without scrolling. Fixed on open,
  // so the row does not jump when another is tapped.
  const [order] = useState(() => (txn ? [txn.category, ...CATEGORIES.filter((c) => c !== txn.category)] : CATEGORIES));

  if (!txn) {
    return (
      <Drawer title="Not found" fallback="/transactions">
        <AppText variant="body" color="textSecondary">
          This transaction no longer exists.
        </AppText>
      </Drawer>
    );
  }

  async function handleDelete() {
    if (!txn) return;
    const ok = await confirmAction(
      'Delete transaction?',
      'It will be removed from your history and won’t come back on the next sync.',
      'Delete'
    );
    if (ok) drawer.current?.close(() => deleteTransaction(txn.id));
  }

  const isCredit = txn.type === 'credit';
  const details: [string, string | null][] = [
    ['Account', account ? account.name : txn.account],
    [isCredit ? 'From' : 'To', toAccount?.name ?? null],
    ['Original amount', txn.original ? formatMoney(txn.original.amount, txn.original.currency) : null],
    ['Balance after', txn.balanceAfter !== null ? formatMoney(txn.balanceAfter, txn.currency) : null],
    ['Note', txn.note],
    ['Source', SOURCE_LABEL[txn.source]],
  ];
  const shown = details.filter((d): d is [string, string] => !!d[1]);

  return (
    <Drawer ref={drawer} title={txn.merchant} subtitle={formatDateTime(txn.date)} fallback="/transactions">
      <NotchCard color={isCredit ? Colors.lime : Colors.forest} notch="both" radius={28} style={styles.hero}>
        <IconBubble category={txn.category} tone={isCredit ? 'white' : 'lime'} size={44} />
        <Money
          amount={txn.amount}
          currency={txn.currency}
          size={38}
          sign={isCredit ? '+' : '−'}
          color={isCredit ? Colors.onLime : Colors.onForest}
          symbolColor={isCredit ? Colors.onLimeMuted : Colors.onForestMuted}
        />
        <Badge label={isCredit ? 'Money in' : 'Money out'} tone={isCredit ? 'forest' : 'lime'} style={styles.badge} />
      </NotchCard>

      {shown.length > 0 && (
        <Card padded={false}>
          {shown.map(([label, value], i) => (
            <View key={label}>
              {i > 0 && <Divider inset={16} />}
              <View style={styles.detailRow}>
                <AppText variant="caption" color="textSecondary">
                  {label}
                </AppText>
                <Text style={styles.detailValue} numberOfLines={2}>
                  {value}
                </Text>
              </View>
            </View>
          ))}
        </Card>
      )}

      <FieldLabel>Category</FieldLabel>
      <ChipRow>
        {order.map((c) => (
          <Chip key={c} label={c} selected={txn.category === c} onPress={() => setCategory(txn.id, c)} />
        ))}
      </ChipRow>

      {txn.source !== 'manual' && (
        <>
          <Pressable
            onPress={() => setShowOriginal(!showOriginal)}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityState={{ expanded: showOriginal }}>
            <Text style={styles.link}>{showOriginal ? 'Hide original message' : 'Show original message'}</Text>
          </Pressable>
          {showOriginal && (
            <Card>
              <AppText variant="caption" color="textSecondary" selectable>
                {txn.rawText}
              </AppText>
            </Card>
          )}
        </>
      )}

      <Button label="Delete" variant="danger" icon="trash" compact onPress={handleDelete} style={styles.delete} />
    </Drawer>
  );
}

const styles = StyleSheet.create({
  hero: { alignItems: 'center', gap: 8, paddingVertical: 24, paddingHorizontal: 20 },
  badge: { alignSelf: 'center', paddingHorizontal: 12, paddingVertical: 4 },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 16,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  detailValue: { flexShrink: 1, textAlign: 'right', fontFamily: Font.semibold, fontSize: 14, color: Colors.text },
  link: { fontFamily: Font.semibold, fontSize: 14, color: Colors.accent, textDecorationLine: 'underline' },
  delete: { alignSelf: 'center' },
});
