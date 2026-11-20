import { useEffect } from 'react';
import { Appearance } from 'react-native';

import { appearancePref, colorScheme } from '@/constants/theme';
import { restartApp } from '@/lib/appearance';

/**
 * When the theme follows the phone and the phone switches between light and dark, restart the
 * app in the new theme (styles are fixed when the app starts).
 */
export function useSchemeWatcher() {
  useEffect(() => {
    if (appearancePref !== 'system') return;
    const subscription = Appearance.addChangeListener(({ colorScheme: next }) => {
      const scheme = next === 'dark' ? 'dark' : 'light';
      if (scheme !== colorScheme) restartApp();
    });
    return () => subscription.remove();
  }, []);
}
