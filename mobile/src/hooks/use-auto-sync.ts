import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';

import { useSync } from '@/hooks/use-sync';
import { useApiKey } from '@/lib/api-key';
import { canSync } from '@/lib/sync';

import {
  onNotificationCaptured,
  pendingNotificationCount,
  reconnectNotificationListener,
} from '../../modules/sms-reader/notifications';

/** Opening and closing the app in quick succession should not start a sync each time. */
const MIN_GAP_MS = 60_000;
/** Apps often post an alert and update it a moment later; wait for them to settle. */
const CAPTURE_SETTLE_MS = 4_000;
/** When a sync is already running, look again after this long. */
const BUSY_RETRY_MS = 5_000;

/**
 * Checks for new SMS and captured notifications whenever the app comes to the front, and reads
 * a notification from a watched app a few seconds after it arrives while the app is open, so
 * transactions are there without tapping Sync. It only reads sources already allowed and never
 * shows a permission prompt; that stays with the Sync button.
 */
export function useAutoSync() {
  const hasKey = useApiKey((s) => s.hasKey);
  const runAutoSync = useSync((s) => s.runAutoSync);
  const lastRun = useRef(0);

  useEffect(() => {
    if (!hasKey || !canSync) return;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const run = () => {
      lastRun.current = Date.now();
      runAutoSync();
    };

    const check = () => {
      // After a reinstall Android can leave the notification listener unbound; ask for it back.
      reconnectNotificationListener();
      // Notifications captured while the app was closed are worth reading however recent the last run.
      if (pendingNotificationCount() === 0 && Date.now() - lastRun.current < MIN_GAP_MS) return;
      run();
    };

    const runWhenIdle = () => {
      timer = null;
      // In the background the next foreground check picks it up instead.
      if (AppState.currentState !== 'active') return;
      if (useSync.getState().running) {
        timer = setTimeout(runWhenIdle, BUSY_RETRY_MS);
        return;
      }
      run();
    };

    const unsubscribe = onNotificationCaptured(() => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(runWhenIdle, CAPTURE_SETTLE_MS);
    });

    check();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') check();
    });
    return () => {
      subscription.remove();
      unsubscribe();
      if (timer) clearTimeout(timer);
    };
  }, [hasKey, runAutoSync]);
}
