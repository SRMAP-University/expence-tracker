import { useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import { Colors, Font, Radius } from '@/constants/theme';
import { useSync } from '@/hooks/use-sync';
import { useApiKey } from '@/lib/api-key';
import { confirmAction } from '@/lib/confirm';
import { formatRelative } from '@/lib/format';
import { ANDROID_PACKAGE, canUseGmail, connectGmail, disconnectGmail, SIGNING_SHA1 } from '@/lib/gmail';
import { useStore } from '@/lib/store';

import { Icon } from './icon';
import { AppText, Badge, Banner, Button, Card, IconBubble } from './ui';

const SETUP_STEPS = [
  'Open console.cloud.google.com and create a project (any name).',
  'APIs & Services > Library: find "Gmail API" and turn it on.',
  'Google Auth Platform > Get started: app name "Expense AI", your email, audience External.',
  'Audience > Test users: add the Gmail address you will connect.',
  'Clients > Create client > Android, with the package name and SHA-1 below.',
];

/** Values shown as selectable text, so they can be copied into Google Cloud exactly. */
function Value({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.value}>
      <Text style={styles.valueLabel}>{label}</Text>
      <Text selectable style={styles.valueText}>
        {value}
      </Text>
    </View>
  );
}

export function GmailSettings() {
  const gmailEmail = useStore((s) => s.gmailEmail);
  const lastEmailSyncAt = useStore((s) => s.lastEmailSyncAt);
  const needsReconnect = useStore((s) => s.gmailNeedsReconnect);
  const setGmailAccount = useStore((s) => s.setGmailAccount);
  const hasKey = useApiKey((s) => s.hasKey);
  const { running, runSmsSync } = useSync();
  const [busy, setBusy] = useState<'connect' | 'disconnect' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showSetup, setShowSetup] = useState(!gmailEmail);

  if (!canUseGmail) {
    return (
      <Card style={styles.card}>
        <Banner tone="info" message="Reading Gmail needs the latest app build installed on an Android phone." />
      </Card>
    );
  }

  async function handleConnect() {
    setBusy('connect');
    setError(null);
    try {
      const email = await connectGmail();
      setGmailAccount(email);
      setShowSetup(false);
      // Read the mailbox straight away rather than waiting for the next app open.
      if (hasKey) runSmsSync();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  async function handleDisconnect() {
    const ok = await confirmAction(
      'Disconnect Gmail?',
      'The app stops reading your email and gives up its access. Transactions already found from email stay.',
      'Disconnect'
    );
    if (!ok) return;
    setBusy('disconnect');
    await disconnectGmail();
    setGmailAccount(null);
    setBusy(null);
  }

  const connected = !!gmailEmail;

  return (
    <Card style={styles.card}>
      <View style={styles.row}>
        <IconBubble name="sms" tone={connected && !needsReconnect ? 'lime' : 'mint'} />
        <View style={styles.fill}>
          <AppText variant="label">Gmail</AppText>
          <AppText variant="caption" color="textSecondary" numberOfLines={1}>
            {connected
              ? `${gmailEmail} · ${lastEmailSyncAt ? `read ${formatRelative(lastEmailSyncAt)}` : 'not read yet'}`
              : 'Not connected'}
          </AppText>
        </View>
        <Badge
          label={!connected ? 'Off' : needsReconnect ? 'Expired' : 'On'}
          tone={!connected ? 'white' : needsReconnect ? 'negative' : 'lime'}
        />
      </View>

      <AppText variant="caption" color="textSecondary">
        Reads receipts, payouts and transfer emails, with read-only access. Only emails that look money-related and
        name an amount are sent to the AI: the sender’s name and domain, the subject, and the start of the message,
        with links removed and long numbers masked.
      </AppText>

      {needsReconnect && (
        <Banner
          tone="warning"
          message="Google stopped giving access. While Google lists the app as in testing, this happens about once a week."
        />
      )}

      {!connected || needsReconnect ? (
        <Button
          label={needsReconnect ? 'Reconnect Gmail' : 'Connect Gmail'}
          icon="key"
          onPress={handleConnect}
          loading={busy === 'connect'}
          disabled={!!busy}
        />
      ) : (
        <View style={styles.actions}>
          <Button
            label="Read email now"
            icon="sync"
            variant="secondary"
            onPress={runSmsSync}
            loading={running === 'sms'}
            disabled={!!running || !hasKey}
            style={styles.fill}
          />
          <Button
            label="Disconnect"
            variant="danger"
            onPress={handleDisconnect}
            loading={busy === 'disconnect'}
            disabled={!!busy}
          />
        </View>
      )}
      {error && <Banner tone="error" message={error} />}

      <Pressable
        onPress={() => setShowSetup(!showSetup)}
        accessibilityRole="button"
        accessibilityState={{ expanded: showSetup }}
        style={styles.toggle}>
        <AppText variant="label" style={styles.fill}>
          One-time Google Cloud setup
        </AppText>
        <Icon name={showSetup ? 'chevronLeft' : 'chevronRight'} size={16} color={Colors.textSecondary} />
      </Pressable>

      {showSetup && (
        <View style={styles.setup}>
          <AppText variant="caption" color="textSecondary">
            Google only lets an app read mail after it is registered in your own Google Cloud account. Nothing to
            paste back here: Google recognises this app by the two values below.
          </AppText>
          {SETUP_STEPS.map((step, i) => (
            <View key={step} style={styles.step}>
              <Text style={styles.stepNumber}>{i + 1}</Text>
              <AppText variant="caption" style={styles.fill}>
                {step}
              </AppText>
            </View>
          ))}
          <Value label="Package name" value={ANDROID_PACKAGE} />
          <Value label="SHA-1 certificate fingerprint" value={SIGNING_SHA1} />
          <AppText variant="caption" color="textSecondary">
            Then tap Connect Gmail. Google will warn that it has not verified the app: it is your own, so continue.
          </AppText>
          <Text
            style={styles.link}
            onPress={() => Linking.openURL('https://console.cloud.google.com/')}
            accessibilityRole="link">
            Open Google Cloud
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
  value: { gap: 2, padding: 12, borderRadius: Radius.md, backgroundColor: Colors.cardMuted },
  valueLabel: { fontFamily: Font.medium, fontSize: 12, color: Colors.textSecondary },
  valueText: { fontFamily: Font.semibold, fontSize: 13, color: Colors.text },
  link: { fontFamily: Font.bold, color: Colors.accent, textDecorationLine: 'underline' },
});
