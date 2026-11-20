import * as Updates from 'expo-updates';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Colors, Font } from '@/constants/theme';
import {
  backupNow,
  connectCloud,
  DEFAULT_SITE,
  disconnectCloud,
  getCloudLink,
  restoreFromCloud,
  type CloudLink,
} from '@/lib/cloud-backup';
import { confirmAction } from '@/lib/confirm';
import { formatRelative } from '@/lib/format';
import { useStore } from '@/lib/store';

import { AppText, Badge, Banner, Button, Card, IconBubble, Input } from './ui';

/** Settings card: pair with the website once, then backups to Neon happen by themselves. */
export function CloudBackupSettings() {
  const state = useStore((s) => s.cloudBackup);
  const [link, setLink] = useState<CloudLink | null>(null);
  const [site, setSite] = useState(DEFAULT_SITE);
  const [code, setCode] = useState('');
  const [bypass, setBypass] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [busy, setBusy] = useState<'connect' | 'backup' | 'restore' | 'disconnect' | null>(null);
  const [message, setMessage] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    getCloudLink().then(setLink);
  }, [state.connected]);

  async function run(kind: NonNullable<typeof busy>, action: () => Promise<string | void>) {
    setBusy(kind);
    setMessage(null);
    try {
      const done = await action();
      if (done) setMessage({ tone: 'success', text: done });
    } catch (e) {
      setMessage({ tone: 'error', text: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(null);
    }
  }

  const connect = () =>
    run('connect', async () => {
      if (!code.trim()) throw new Error('Enter the code you sign in to the website with.');
      const next = await connectCloud(site, code, bypass.trim() || undefined);
      setLink(next);
      setCode('');
      await backupNow(Updates.runtimeVersion ?? null);
      return `Connected as ${next.user.email}. Your data is backed up.`;
    });

  const restore = async () => {
    const ok = await confirmAction(
      'Restore from the website?',
      'Everything on this phone (transactions, accounts, history) is replaced by the website’s last backup.',
      'Restore'
    );
    if (!ok) return;
    run('restore', async () => {
      const result = await restoreFromCloud();
      return `Restored ${result.transactions} transactions from the backup of ${new Date(result.savedAt).toLocaleString()}.`;
    });
  };

  const disconnect = async () => {
    const ok = await confirmAction(
      'Stop backing up?',
      'This phone is unpaired from the website. The backup already there stays.',
      'Disconnect'
    );
    if (ok) run('disconnect', async () => {
      await disconnectCloud();
      setLink(null);
    });
  };

  return (
    <Card style={styles.card}>
      <View style={styles.row}>
        <IconBubble name="shield" tone={state.connected ? 'lime' : 'mint'} />
        <View style={styles.fill}>
          <AppText variant="label">Backup to your website</AppText>
          <AppText variant="caption" color="textSecondary" numberOfLines={2}>
            {state.connected && link
              ? `${link.user.email} · ${state.lastBackupAt ? `backed up ${formatRelative(state.lastBackupAt)}` : 'not backed up yet'}`
              : 'Keeps a copy of everything in your Neon database, so a lost phone loses nothing.'}
          </AppText>
        </View>
        <Badge label={state.connected ? 'On' : 'Off'} tone={state.connected ? 'lime' : 'white'} />
      </View>

      {state.connected ? (
        <>
          <View style={styles.actions}>
            <Button
              label="Back up now"
              icon="sync"
              variant="secondary"
              compact
              loading={busy === 'backup'}
              disabled={!!busy}
              onPress={() => run('backup', async () => {
                await backupNow(Updates.runtimeVersion ?? null);
                return 'Backed up.';
              })}
              style={styles.fill}
            />
            <Button
              label="Restore"
              icon="back"
              variant="secondary"
              compact
              loading={busy === 'restore'}
              disabled={!!busy}
              onPress={restore}
              style={styles.fill}
            />
          </View>
          <Button label="Disconnect" variant="ghost" compact disabled={!!busy} onPress={disconnect} />
          {state.error && !message && <Banner tone="warning" message={`Last backup failed: ${state.error}`} />}
        </>
      ) : (
        <>
          <Input
            value={code}
            onChangeText={setCode}
            placeholder="Your website login code"
            autoCapitalize="none"
            autoCorrect={false}
            secureTextEntry
            accessibilityLabel="Website login code"
          />
          <Pressable onPress={() => setShowAdvanced(!showAdvanced)} accessibilityRole="button" hitSlop={8}>
            <Text style={styles.link}>{showAdvanced ? 'Hide website settings' : 'Website settings'}</Text>
          </Pressable>
          {showAdvanced && (
            <>
              <Input
                value={site}
                onChangeText={setSite}
                placeholder="https://your-site.vercel.app"
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
                accessibilityLabel="Website address"
              />
              <Input
                value={bypass}
                onChangeText={setBypass}
                placeholder="Vercel protection bypass secret (optional)"
                autoCapitalize="none"
                autoCorrect={false}
                secureTextEntry
                accessibilityLabel="Vercel protection bypass secret"
              />
            </>
          )}
          <Button label="Connect" icon="lock" loading={busy === 'connect'} disabled={!!busy} onPress={connect} />
        </>
      )}
      {message && <Banner tone={message.tone} message={message.text} />}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  fill: { flex: 1 },
  actions: { flexDirection: 'row', gap: 8 },
  link: { fontFamily: Font.semibold, fontSize: 13, color: Colors.accent },
});
