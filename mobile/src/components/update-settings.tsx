import * as Updates from 'expo-updates';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Colors, Font } from '@/constants/theme';
import { formatDateTime } from '@/lib/format';

import { AppText, Banner, Button, Card } from './ui';

type Status =
  | { kind: 'idle' }
  | { kind: 'busy'; label: string }
  | { kind: 'done'; message: string }
  | { kind: 'error'; message: string };

const DAY = 86_400_000;

/**
 * Which version of the app is running and where it came from (the installed APK, or an update
 * downloaded over the air), with a button to check for a newer one. Problems with updates are
 * shown here as they happened, so they can be reported.
 */
export function UpdateSettings() {
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const [problems, setProblems] = useState<string[]>([]);

  useEffect(() => {
    if (!Updates.isEnabled) return;
    Updates.readLogEntriesAsync(DAY)
      .then((entries) =>
        setProblems(
          entries
            .filter((e) => e.level === 'error' || e.level === 'fatal')
            .slice(-3)
            .map((e) => `${new Date(e.timestamp).toLocaleTimeString()}: ${e.message}`)
        )
      )
      .catch(() => {});
  }, []);

  async function checkNow() {
    try {
      setStatus({ kind: 'busy', label: 'Checking…' });
      const check = await Updates.checkForUpdateAsync();
      if (!check.isAvailable) return setStatus({ kind: 'done', message: 'You have the latest version.' });
      setStatus({ kind: 'busy', label: 'Downloading…' });
      await Updates.fetchUpdateAsync();
      setStatus({ kind: 'busy', label: 'Restarting…' });
      await Updates.reloadAsync();
    } catch (e) {
      setStatus({ kind: 'error', message: e instanceof Error ? e.message : String(e) });
    }
  }

  const source = !Updates.isEnabled
    ? 'Development build'
    : Updates.isEmbeddedLaunch
      ? 'Built into the installed app'
      : `Update from ${Updates.createdAt ? formatDateTime(Updates.createdAt.toISOString()) : 'unknown date'}`;

  return (
    <Card style={styles.card}>
      <View style={styles.row}>
        <AppText variant="label" style={styles.fill}>
          Version {Updates.runtimeVersion ?? '—'}
        </AppText>
        <Text style={styles.small}>{Updates.channel ?? ''}</Text>
      </View>
      <AppText variant="caption" color="textSecondary">
        {source}
        {Updates.updateId ? ` · ${Updates.updateId.slice(0, 8)}` : ''}
      </AppText>

      {Updates.isEmergencyLaunch && (
        <Banner
          tone="warning"
          message={`The last update could not start, so the app went back to an earlier version. ${
            Updates.emergencyLaunchReason ?? ''
          }`.trim()}
        />
      )}

      {Updates.isEnabled && (
        <Button
          label={status.kind === 'busy' ? status.label : 'Check for updates'}
          icon="sync"
          variant="secondary"
          loading={status.kind === 'busy'}
          disabled={status.kind === 'busy'}
          onPress={checkNow}
        />
      )}
      {status.kind === 'done' && <Banner tone="success" message={status.message} />}
      {status.kind === 'error' && <Banner tone="error" message={`Update failed: ${status.message}`} />}

      {problems.length > 0 && (
        <View style={styles.problems}>
          <AppText variant="caption" color="textSecondary">
            Recent update problems:
          </AppText>
          {problems.map((p, i) => (
            <Text key={i} style={styles.problem} selectable>
              {p}
            </Text>
          ))}
        </View>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: 10 },
  row: { flexDirection: 'row', alignItems: 'baseline' },
  fill: { flex: 1 },
  small: { fontFamily: Font.medium, fontSize: 12, color: Colors.textTertiary },
  problems: { gap: 4 },
  problem: { fontFamily: Font.medium, fontSize: 12, lineHeight: 16, color: Colors.negative },
});
