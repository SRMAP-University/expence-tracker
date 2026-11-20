import { useState } from 'react';
import { StyleSheet } from 'react-native';

import { appearancePref } from '@/constants/theme';
import { restartApp, saveAppearancePref, type AppearancePref } from '@/lib/appearance';

import { AppText, Card, Segmented } from './ui';

const OPTIONS = [
  { value: 'system', label: 'Phone' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
] as const;

/** Light or dark. The theme is set as the app starts, so a change restarts it. */
export function AppearanceSettings() {
  const [pref, setPref] = useState<AppearancePref>(appearancePref);
  const [restarting, setRestarting] = useState(false);

  function choose(next: AppearancePref) {
    if (next === pref) return;
    setPref(next);
    saveAppearancePref(next);
    setRestarting(true);
    // A moment for the switch to finish sliding before the app restarts.
    setTimeout(() => restartApp(), 350);
  }

  return (
    <Card style={styles.card}>
      <Segmented options={OPTIONS} value={pref} onChange={choose} />
      <AppText variant="caption" color="textSecondary">
        {restarting
          ? 'Restarting in the new theme…'
          : pref === 'system'
            ? 'Follows your phone’s dark mode.'
            : `Always ${pref}, whatever the phone is set to.`}
      </AppText>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: 10 },
});
