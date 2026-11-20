import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { Bouncy } from './bouncy';
import { Colors, Font } from '@/constants/theme';
import { netWorth } from '@/lib/accounts';
import { formatMoney } from '@/lib/format';
import type { DisplayAccount } from '@/lib/money';
import { ACCOUNT_KIND_LABEL } from '@/lib/types';

import { ACCOUNT_GLYPH_NAME, Icon } from './icon';
import { AppText, Card, IconBubble, Money } from './ui';

/**
 * Every bank, platform and asset in one compact card: net worth on top, one line per account.
 * Sits right under the hero on Home. Cards (money owed) are listed last.
 */
export function AccountsSummary({ accounts, currency }: { accounts: DisplayAccount[]; currency: string }) {
  const worth = netWorth(accounts, currency);
  const ordered = [...accounts].sort(
    (a, b) => Number(a.kind === 'card') - Number(b.kind === 'card') || b.balance - a.balance
  );

  if (accounts.length === 0) {
    return (
      <Bouncy scaleTo={0.97}
        onPress={() => router.navigate('/accounts')}
        accessibilityRole="button"
        accessibilityLabel="Add your banks and assets"
        >
        <Card style={styles.emptyRow}>
          <IconBubble name="wallet" tone="lime" size={34} />
          <View style={styles.fill}>
            <AppText variant="label">Add your banks and assets</AppText>
            <AppText variant="caption" color="textSecondary">
              Stripe, Revolut, Binance, bank accounts, cash
            </AppText>
          </View>
          <Icon name="chevronRight" size={18} color={Colors.textSecondary} />
        </Card>
      </Bouncy>
    );
  }

  return (
    <Card padded={false} style={styles.card}>
      <Bouncy scaleTo={0.97}
        onPress={() => router.navigate('/accounts')}
        accessibilityRole="button"
        accessibilityLabel="Net worth. Opens your accounts."
        style={[styles.header]}>
        <View style={styles.fill}>
          <AppText variant="label">Net worth</AppText>
          <Text style={styles.caption}>
            {accounts.length} account{accounts.length === 1 ? '' : 's'}
          </Text>
        </View>
        <Money
          amount={worth.total}
          currency={currency}
          size={22}
          compact
          sign={worth.total < 0 ? '−' : undefined}
        />
        <Icon name="chevronRight" size={16} color={Colors.textSecondary} />
      </Bouncy>

      {ordered.map((a) => (
        <Bouncy scaleTo={0.97}
          key={a.id}
          onPress={() => router.push({ pathname: '/accounts/[id]', params: { id: a.id } })}
          accessibilityRole="button"
          accessibilityLabel={`${a.name}, ${ACCOUNT_KIND_LABEL[a.kind]}, ${formatMoney(a.balance, a.currency)}`}
          style={[styles.row]}>
          <IconBubble name={ACCOUNT_GLYPH_NAME[a.kind]} tone={a.kind === 'card' ? 'mint' : 'lime'} size={30} />
          <Text style={styles.name} numberOfLines={1}>
            {a.name}
          </Text>
          <Text style={[styles.amount, a.kind === 'card' && styles.owed]}>
            {a.kind === 'card' ? '−' : ''}
            {formatMoney(a.balance, a.currency, { compact: true })}
          </Text>
        </Bouncy>
      ))}
    </Card>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  card: { paddingBottom: 6, overflow: 'hidden' },
  emptyRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
    marginBottom: 4,
  },
  caption: { fontFamily: Font.medium, fontSize: 12, color: Colors.textSecondary },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 6 },
  name: { flex: 1, fontFamily: Font.semibold, fontSize: 14, color: Colors.text },
  amount: { fontFamily: Font.semibold, fontSize: 14, color: Colors.text },
  owed: { color: Colors.negative },
});
