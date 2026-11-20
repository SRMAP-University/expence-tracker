import * as Updates from 'expo-updates';
import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';

/** Coming back to the app checks again, but not more often than this. */
const MIN_GAP_MS = 30 * 60_000;

/**
 * Over-the-air updates: the app checks for a new version when it starts (set in app.json) and,
 * with this, also when it comes back to the front. A new version downloads in the background;
 * Home then offers to restart into it (see SyncStatus). Off in development builds.
 */
export function useOtaCheck() {
  const lastCheck = useRef(0);

  useEffect(() => {
    if (!Updates.isEnabled) return;
    const subscription = AppState.addEventListener('change', async (state) => {
      if (state !== 'active' || Date.now() - lastCheck.current < MIN_GAP_MS) return;
      lastCheck.current = Date.now();
      try {
        const check = await Updates.checkForUpdateAsync();
        if (check.isAvailable) await Updates.fetchUpdateAsync();
      } catch {
        // Offline or the update server unreachable: the next start tries again.
      }
    });
    return () => subscription.remove();
  }, []);
}
