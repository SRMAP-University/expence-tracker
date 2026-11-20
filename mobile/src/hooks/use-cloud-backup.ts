import * as Updates from 'expo-updates';
import { useEffect } from 'react';
import { AppState } from 'react-native';

import { backupNow } from '@/lib/cloud-backup';
import { useStore } from '@/lib/store';

/** After a change, wait this long for more changes before backing up. */
const SETTLE_MS = 90_000;

/**
 * Backs the data up to the website on its own: a minute and a half after it changes, and when
 * the app goes to the background with changes not yet sent. Does nothing until the phone is
 * paired, and never sends an empty phone (so a reset cannot wipe the website's copy).
 */
export function useCloudBackup() {
  const connected = useStore((s) => s.cloudBackup.connected);

  useEffect(() => {
    if (!connected) return;
    let dirty = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const send = () => {
      if (timer) clearTimeout(timer);
      timer = null;
      const s = useStore.getState();
      if (!dirty || (!s.transactions.length && !s.accounts.length)) return;
      dirty = false;
      backupNow(Updates.runtimeVersion ?? null).catch(() => {
        // Recorded in the store for Settings; the next change or visit tries again.
        dirty = true;
      });
    };

    const unsubscribe = useStore.subscribe((state, prev) => {
      const changed =
        state.transactions !== prev.transactions ||
        state.accounts !== prev.accounts ||
        state.settings !== prev.settings ||
        state.calcHistory !== prev.calcHistory ||
        state.chat !== prev.chat;
      if (!changed) return;
      dirty = true;
      if (timer) clearTimeout(timer);
      timer = setTimeout(send, SETTLE_MS);
    });

    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'background') send();
    });

    return () => {
      unsubscribe();
      subscription.remove();
      if (timer) clearTimeout(timer);
    };
  }, [connected]);
}
