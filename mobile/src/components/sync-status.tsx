import { router } from 'expo-router';
import * as Updates from 'expo-updates';
import { useState } from 'react';
import { Linking } from 'react-native';

import { useSync } from '@/hooks/use-sync';
import { useApiKey } from '@/lib/api-key';
import { useStore } from '@/lib/store';

import { Banner } from './ui';

/**
 * What the AI is doing with your messages, in one line: sorting them right now, the result of
 * the last run, or the one thing it needs from you (a key). Renders nothing when all is quiet.
 */
export function SyncStatus() {
  const { running, progress, outcome, dismiss } = useSync();
  const hasKey = useApiKey((s) => s.hasKey);
  const gmailNeedsReconnect = useStore((s) => !!s.gmailEmail && s.gmailNeedsReconnect);
  const binanceNeedsReconnect = useStore((s) => s.binanceConnected && s.binanceNeedsReconnect);
  const { isUpdatePending } = Updates.useUpdates();
  const [restart, setRestart] = useState<'idle' | 'restarting' | string>('idle');

  if (running === 'reanalyze') {
    const count = progress && progress.total > 0 ? ` ${Math.min(progress.done, progress.total)}/${progress.total}` : '';
    return <Banner tone="info" message={`AI is sorting your messages…${count}`} />;
  }

  // A new version came over the air and is downloaded; it starts the next time the app opens.
  if (Updates.isEnabled && isUpdatePending) {
    const failed = restart !== 'idle' && restart !== 'restarting';
    return (
      <Banner
        tone={failed ? 'warning' : 'success'}
        message={
          failed
            ? `The app could not restart by itself (${restart}). Close it from your recent apps and open it again: the new version starts then.`
            : restart === 'restarting'
              ? 'Restarting…'
              : 'A new version of the app is ready. It also starts the next time you open the app.'
        }
        action={
          restart === 'idle'
            ? {
                label: 'Restart now',
                onPress: () => {
                  setRestart('restarting');
                  Updates.reloadAsync().catch((e: unknown) =>
                    setRestart(e instanceof Error ? e.message : String(e))
                  );
                },
              }
            : undefined
        }
      />
    );
  }

  if (outcome) {
    const action =
      outcome.fix === 'android-settings'
        ? { label: 'Open app settings', onPress: () => Linking.openSettings() }
        : outcome.fix === 'add-key'
          ? { label: 'Add OpenAI key', onPress: () => router.push('/settings') }
          : { label: 'Dismiss', onPress: dismiss };
    return <Banner tone={outcome.tone} message={outcome.message} action={action} />;
  }

  if (binanceNeedsReconnect) {
    return (
      <Banner
        tone="warning"
        message="Binance stopped accepting your API key, so new Binance activity is not being read."
        action={{ label: 'Reconnect Binance', onPress: () => router.push('/settings') }}
      />
    );
  }

  if (gmailNeedsReconnect) {
    return (
      <Banner
        tone="warning"
        message="Gmail access has expired, so new emails are not being read."
        action={{ label: 'Reconnect Gmail', onPress: () => router.push('/settings') }}
      />
    );
  }

  if (hasKey === false) {
    return (
      <Banner
        tone="warning"
        message="Add your OpenAI key so the AI can read your bank messages and sort them into spending, income and transfers."
        action={{ label: 'Add OpenAI key', onPress: () => router.push('/settings') }}
      />
    );
  }

  return null;
}
