import { router } from 'expo-router';
import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Bouncy } from '@/components/bouncy';
import { ACCOUNT_GLYPH_NAME } from '@/components/icon';
import { CountUpMoney, Rise } from '@/components/motion';
import { NetWorthChart } from '@/components/networth-chart';
import { NotchCard } from '@/components/notch-card';
import {
  AppText,
  Banner,
  Button,
  Card,
  CoinBadge,
  Divider,
  IconBubble,
  IconButton,
  Screen,
  ScreenTitle,
  SectionHeader,
} from '@/components/ui';
import { Colors, Font } from '@/constants/theme';
import { useLedger } from '@/hooks/use-ledger';
import { useSync } from '@/hooks/use-sync';
import { netWorth, suggestAccounts } from '@/lib/accounts';
import { useApiKey } from '@/lib/api-key';
import { formatMoney, formatRelative } from '@/lib/format';
import type { DisplayAccount } from '@/lib/money';
import { useStore } from '@/lib/store';
import { reanalyzable } from '@/lib/sync';
import { ACCOUNT_KINDS, type AccountKind } from '@/lib/types';

const KIND_TITLE: Record<AccountKind, string> = {
  bank: 'Bank accounts',
  card: 'Credit cards',
  wallet: 'Wallets',
  payments: 'Payment platforms',
  crypto: 'Crypto',
  investment: 'Investments',
  cash: 'Cash',
};

function balanceNote(a: DisplayAccount) {
  const digits = a.last4 ? `••${a.last4} · ` : '';
  const source =
    a.balanceSource === 'sms' ? 'from bank message' : a.balanceSource === 'api' ? 'from Binance' : 'set by you';
  return `${digits}${source} ${formatRelative(a.balanceUpdatedAt)}`;
}

export default function AccountsScreen() {
  const ledger = useLedger();
  const { accounts, currency } = ledger;
  const storedTransactions = useStore((s) => s.transactions);
  const storedAccounts = useStore((s) => s.accounts);
  const accountsChanged = useStore((s) => s.accountsChanged);
  const hasKey = useApiKey((s) => s.hasKey);
  const { running, progress, runReanalyze } = useSync();

  const worth = useMemo(() => netWorth(accounts, currency), [accounts, currency]);
  // Suggestions match on the labels and balances exactly as the bank messages gave them.
  const suggestions = useMemo(
    () => suggestAccounts(storedTransactions, storedAccounts),
    [storedTransactions, storedAccounts]
  );
  const messageCount = useMemo(() => reanalyzable(storedTransactions).length, [storedTransactions]);
  const groups = ACCOUNT_KINDS.map((kind) => ({ kind, items: accounts.filter((a) => a.kind === kind) })).filter(
    (g) => g.items.length > 0
  );
  const reanalysing = running === 'reanalyze';

  return (
    <Screen>
      <Rise>
        <ScreenTitle
          title={'Your Money\nAll in One Place'}
          subtitle="Banks, payment platforms, crypto and cash"
          right={<IconButton icon="plus" label="Add account" onPress={() => router.push({ pathname: '/account/[id]', params: { id: 'new' } })} />}
        />
      </Rise>

      <Rise index={1}>
        <NotchCard color={Colors.forest} radius={32} style={styles.hero}>
          <View style={styles.heroTop}>
            <CoinBadge currency={currency} />
            <Text style={[styles.onForest, styles.fill]}>Net worth</Text>
            <Text style={styles.onForestMuted}>
              {accounts.length} account{accounts.length === 1 ? '' : 's'}
            </Text>
          </View>
          <CountUpMoney
            amount={worth.total}
            currency={currency}
            size={40}
            sign={worth.total < 0 ? '−' : undefined}
            color={Colors.onForest}
            symbolColor={Colors.onForestMuted}
            style={styles.heroAmount}
          />
          {worth.owed > 0 && (
            <Text style={[styles.onForestMuted, styles.center]}>
              {formatMoney(worth.assets, currency, { compact: true })} held ·{' '}
              {formatMoney(worth.owed, currency, { compact: true })} owed on cards
            </Text>
          )}
          <Button label="Add account" icon="plus" variant="onDark" onPress={() => router.push({ pathname: '/account/[id]', params: { id: 'new' } })} />
        </NotchCard>
      </Rise>

      {accounts.length > 0 && ledger.transactions.length > 0 && (
        <Rise index={2}>
          <NetWorthChart ledger={ledger} />
        </Rise>
      )}

      {worth.otherCurrencyCount > 0 && (
        <AppText variant="caption" color="textSecondary" style={styles.note}>
          {worth.otherCurrencyCount} account{worth.otherCurrencyCount === 1 ? ' is' : 's are'} in a currency with no
          exchange rate, so not in this total. Add a rate in Settings.
        </AppText>
      )}

      {accountsChanged && messageCount > 0 && (
        <Banner
          tone="info"
          message={
            reanalysing
              ? `${progress?.label ?? 'Working'}… ${progress && progress.total > 0 ? `${Math.min(progress.done, progress.total)}/${progress.total}` : ''}`
              : hasKey
                ? 'Your accounts changed. The AI will re-sort your messages in a moment, so moves between your own accounts stop counting as spending.'
                : 'Your accounts changed. Add your OpenAI key and the AI will re-sort your messages, so moves between your own accounts stop counting as spending.'
          }
          action={
            reanalysing
              ? undefined
              : hasKey
                ? { label: 'Sort them now', onPress: runReanalyze }
                : { label: 'Add OpenAI key first', onPress: () => router.push('/settings') }
          }
        />
      )}

      {accounts.length === 0 && (
        <Rise index={2}>
          <Card style={styles.empty}>
            <IconBubble name="wallet" tone="lime" size={52} />
            <AppText variant="heading" style={styles.center}>
              Add where your money lives
            </AppText>
            <AppText variant="caption" color="textSecondary" style={styles.center}>
              List each bank account, payment platform, crypto exchange and card. The AI then knows a move between
              two of them is a transfer, not spending or income, and you see everything you hold in one total.
            </AppText>
          </Card>
        </Rise>
      )}

      {groups.map((group, groupIndex) => {
        const subtotal = group.items.filter((a) => a.currency === currency).reduce((sum, a) => sum + a.balance, 0);
        return (
          <Rise key={group.kind} index={2 + groupIndex} style={styles.section}>
            <SectionHeader title={KIND_TITLE[group.kind]} />
            <Card padded={false}>
              {group.items.map((a, i) => (
                <View key={a.id}>
                  {i > 0 && <Divider inset={16} />}
                  <Bouncy scaleTo={0.97}
                    onPress={() => router.push({ pathname: '/accounts/[id]', params: { id: a.id } })}
                    accessibilityRole="button"
                    accessibilityLabel={`${a.name}, ${formatMoney(a.balance, a.currency)}. Opens its transactions.`}
                    style={[styles.row]}>
                    <IconBubble name={ACCOUNT_GLYPH_NAME[a.kind]} tone={a.kind === 'card' ? 'mint' : 'lime'} />
                    <View style={styles.rowText}>
                      <AppText variant="body" numberOfLines={1} style={styles.semibold}>
                        {a.name}
                      </AppText>
                      <AppText variant="caption" color="textSecondary" numberOfLines={1}>
                        {balanceNote(a)}
                      </AppText>
                    </View>
                    <View style={styles.rowAmount}>
                      <Text style={styles.amount}>{formatMoney(a.balance, a.currency)}</Text>
                      {a.original && (
                        <Text style={styles.original}>{formatMoney(a.original.balance, a.original.currency)}</Text>
                      )}
                    </View>
                  </Bouncy>
                </View>
              ))}
              {group.items.length > 1 && (
                <View style={styles.subtotal}>
                  <AppText variant="caption" color="textSecondary" style={styles.fill}>
                    {group.kind === 'card' ? 'Total owed' : 'Total'}
                  </AppText>
                  <Text style={styles.amount}>{formatMoney(subtotal, currency)}</Text>
                </View>
              )}
            </Card>
          </Rise>
        );
      })}

      {suggestions.length > 0 && (
        <Rise index={2 + groups.length} style={styles.section}>
          <SectionHeader title="Seen in your messages" />
          <Card padded={false}>
            {suggestions.slice(0, 8).map((s, i) => (
              <View key={s.last4}>
                {i > 0 && <Divider inset={16} />}
                <View style={styles.row}>
                  <IconBubble name="bank" />
                  <View style={styles.rowText}>
                    <AppText variant="body" numberOfLines={1} style={styles.semibold}>
                      {s.label}
                    </AppText>
                    <AppText variant="caption" color="textSecondary">
                      {s.count} transaction{s.count === 1 ? '' : 's'}
                    </AppText>
                  </View>
                  <Button
                    label="Add"
                    variant="secondary"
                    compact
                    onPress={() =>
                      router.push({
                        pathname: '/account/[id]',
                        params: {
                          id: 'new',
                          name: s.label.replace(/[\s•*xX]*\d+$/, '').trim() || s.label,
                          last4: s.last4,
                          balance: s.balance === null ? '' : String(s.balance),
                        },
                      })
                    }
                  />
                </View>
              </View>
            ))}
          </Card>
          <AppText variant="caption" color="textSecondary" style={styles.note}>
            These account endings appear in your bank alerts but are not in your list yet.
          </AppText>
        </Rise>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  center: { textAlign: 'center' },
  semibold: { fontFamily: Font.semibold },
  // Top padding clears the notch recess.
  hero: { paddingTop: 26, paddingHorizontal: 16, paddingBottom: 16, gap: 12 },
  heroTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  heroAmount: { alignSelf: 'center', paddingVertical: 6 },
  onForest: { fontFamily: Font.semibold, fontSize: 15, color: Colors.onForest },
  onForestMuted: { fontFamily: Font.medium, fontSize: 12, color: Colors.onForestMuted },
  note: { paddingHorizontal: 4 },
  empty: { alignItems: 'center', gap: 12, paddingVertical: 24 },
  section: { gap: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12 },
  rowText: { flex: 1, minWidth: 0 },
  rowAmount: { alignItems: 'flex-end' },
  amount: { fontFamily: Font.semibold, fontSize: 15, color: Colors.text },
  original: { fontFamily: Font.medium, fontSize: 12, color: Colors.textSecondary },
  subtotal: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.border,
  },
});
