import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';

import {
  getWatchedPackages,
  hasNotificationAccess,
  isNotificationListenerConnected,
} from '../../modules/sms-reader/notifications';

function read() {
  const access = hasNotificationAccess();
  return {
    access,
    /** False when access is granted but Android has not started the listener, so nothing is captured. */
    listening: access && isNotificationListenerConnected(),
    watched: getWatchedPackages().length,
  };
}

/**
 * Whether notification access is granted, whether the listener is actually running, and how
 * many apps are watched. These change outside the screen showing them (in Android's settings,
 * or in the app picker), so this re-reads when the screen regains focus and when the app
 * returns to the front. `refresh` re-reads on demand, e.g. after asking for a reconnect.
 */
export function useNotificationStatus() {
  const [status, setStatus] = useState(read);
  const refresh = useCallback(() => setStatus(read()), []);

  useFocusEffect(refresh);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') refresh();
    });
    return () => subscription.remove();
  }, [refresh]);

  return { ...status, refresh };
}
