import { useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import { Colors, Font } from '@/constants/theme';
import { useSync } from '@/hooks/use-sync';
import { useApiKey } from '@/lib/api-key';
import {
  deleteBinanceCredentials,
  fetchTotalBalanceUsd,
  saveBinanceCredentials,
  verifyReadOnlyKey,
} from '@/lib/binance';
import { confirmAction } from '@/lib/confirm';
import { formatMoney, formatRelative } from '@/lib/format';
import { useStore } from '@/lib/store';

import { Icon } from './icon';
import { AppText, Badge, Banner, Button, Card, IconBubble, Input } from './ui';

const SETUP_STEPS = [
  'On binance.com, open Account > API Management and create an API key (System generated).',
  'Leave only Enable Reading ticked. Do not allow trading, transfers or withdrawals.',
  'Leave IP access unrestricted: your phone’s address changes, and the key can only read.',
  'Copy the API key and the secret key into the boxes here. Binance shows the secret only once.',
];

export function BinanceSettings() {
  const connected = useStore((s) => s.binanceConnected);
  const needsReconnect = useStore((s) => s.binanceNeedsReconnect);
  const lastSync = useStore((s) => s.lastBinanceSyncAt);
  const account = useStore((s) => s.accounts.find((a) => a.id === s.binanceAccountId) ?? null);
  const hasKey = useApiKey((s) => s.hasKey);
  const { running, runSmsSync } = useSync();
  const [apiKey, setApiKeyDraft] = useState('');
  const [secret, setSecret] = useState('');
  const [busy, setBusy] = useState<'connect' | 'disconnect' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showSetup, setShowSetup] = useState(!connected);

  const showForm = !connected || needsReconnect;

  async function handleConnect() {
    const creds = { apiKey: apiKey.trim(), secret: secret.trim() };
    if (!creds.apiKey || !creds.secret) return setError('Paste both the API key and the secret key.');
    setBusy('connect');
    setError(null);
    try {
      // Checked before saving: a wrong key, or one that can move money, is never stored.
      await verifyReadOnlyKey(creds);
      await saveBinanceCredentials(creds);

      const store = useStore.getState();
      const existing = store.accounts.find((a) => /binance/i.test(a.name));
      const accountId =
        existing?.id ?? store.addAccount({ name: 'Binance', kind: 'crypto', last4: null, balance: 0, currency: 'USD' });
      store.setBinance(true, accountId);
      const total = await fetchTotalBalanceUsd(creds).catch(() => null);
      if (total !== null) useStore.getState().setApiBalance(accountId, total, 'USD');

      setApiKeyDraft('');
      setSecret('');
      setShowSetup(false);
      if (hasKey) runSmsSync();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  async function handleDisconnect() {
    const ok = await confirmAction(
      'Disconnect Binance?',
      'The key is removed from this phone and Binance is no longer read. Your Binance account and the transactions already found stay. Delete the key in Binance too.',
      'Disconnect'
    );
    if (!ok) return;
    setBusy('disconnect');
    await deleteBinanceCredentials();
    useStore.getState().setBinance(false, useStore.getState().binanceAccountId);
    setBusy(null);
  }

  return (
    <Card style={styles.card}>
      <View style={styles.row}>
        <IconBubble name="crypto" tone={connected && !needsReconnect ? 'lime' : 'mint'} />
        <View style={styles.fill}>
          <AppText variant="label">Binance</AppText>
          <AppText variant="caption" color="textSecondary" numberOfLines={1}>
            {connected
              ? `${account ? `${formatMoney(account.balance, account.currency)} · ` : ''}${lastSync ? `read ${formatRelative(lastSync)}` : 'not read yet'}`
              : 'Not connected'}
          </AppText>
        </View>
        <Badge
          label={!connected ? 'Off' : needsReconnect ? 'Key rejected' : 'On'}
          tone={!connected ? 'white' : needsReconnect ? 'negative' : 'lime'}
        />
      </View>

      <AppText variant="caption" color="textSecondary">
        Reads your deposits, withdrawals, bank and card purchases, Binance Pay payments and total balance with a
        read-only key. Each record goes to the AI like a bank alert; the key and secret stay on this phone and are
        sent only to Binance.
      </AppText>

      {needsReconnect && (
        <Banner tone="warning" message="Binance stopped accepting the saved key. Paste a new read-only key." />
      )}

      {showForm ? (
        <>
          <Input
            value={apiKey}
            onChangeText={(v) => {
              setApiKeyDraft(v);
              setError(null);
            }}
            placeholder="API key"
            autoCapitalize="none"
            autoCorrect={false}
            secureTextEntry
            accessibilityLabel="Binance API key"
          />
          <Input
            value={secret}
            onChangeText={(v) => {
              setSecret(v);
              setError(null);
            }}
            placeholder="Secret key"
            autoCapitalize="none"
            autoCorrect={false}
            secureTextEntry
            accessibilityLabel="Binance secret key"
          />
          <Button
            label={needsReconnect ? 'Save new key' : 'Connect Binance'}
            icon="lock"
            onPress={handleConnect}
            loading={busy === 'connect'}
            disabled={!!busy || !apiKey.trim() || !secret.trim()}
          />
        </>
      ) : (
        <View style={styles.actions}>
          <Button
            label="Read Binance now"
            icon="sync"
            variant="secondary"
            onPress={runSmsSync}
            loading={running === 'sms'}
            disabled={!!running || !hasKey}
            style={styles.fill}
          />
          <Button label="Disconnect" variant="danger" onPress={handleDisconnect} loading={busy === 'disconnect'} disabled={!!busy} />
        </View>
      )}
      {connected && needsReconnect && (
        <Button label="Disconnect" variant="danger" onPress={handleDisconnect} loading={busy === 'disconnect'} disabled={!!busy} />
      )}
      {error && <Banner tone="error" message={error} />}

      <Pressable
        onPress={() => setShowSetup(!showSetup)}
        accessibilityRole="button"
        accessibilityState={{ expanded: showSetup }}
        style={styles.toggle}>
        <AppText variant="label" style={styles.fill}>
          How to make a read-only key
        </AppText>
        <Icon name={showSetup ? 'chevronLeft' : 'chevronRight'} size={16} color={Colors.textSecondary} />
      </Pressable>
      {showSetup && (
        <View style={styles.setup}>
          {SETUP_STEPS.map((step, i) => (
            <View key={step} style={styles.step}>
              <Text style={styles.stepNumber}>{i + 1}</Text>
              <AppText variant="caption" style={styles.fill}>
                {step}
              </AppText>
            </View>
          ))}
          <AppText variant="caption" color="textSecondary">
            The app refuses a key that can trade, transfer or withdraw.
          </AppText>
          <Text
            style={styles.link}
            onPress={() => Linking.openURL('https://www.binance.com/en/my/settings/api-management')}
            accessibilityRole="link">
            Open Binance API Management
          </Text>
        </View>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  card: { gap: 14 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  actions: { flexDirection: 'row', gap: 8 },
  toggle: { flexDirection: 'row', alignItems: 'center', paddingTop: 4 },
  setup: { gap: 10 },
  step: { flexDirection: 'row', gap: 10 },
  stepNumber: {
    width: 20,
    height: 20,
    borderRadius: 10,
    overflow: 'hidden',
    textAlign: 'center',
    lineHeight: 20,
    fontFamily: Font.bold,
    fontSize: 11,
    color: Colors.onLime,
    backgroundColor: Colors.lime,
  },
  link: { fontFamily: Font.bold, color: Colors.accent, textDecorationLine: 'underline' },
});
