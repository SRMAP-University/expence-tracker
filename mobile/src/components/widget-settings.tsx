import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { AppState, Linking, PermissionsAndroid, Platform, StyleSheet, View } from 'react-native';

import { useStore } from '@/lib/store';

import {
  canPinWidget,
  getWidgetConfig,
  getWidgetIds,
  isHomeWidgetAvailable,
  liveUpdatesAllowed,
  openNotificationSettings,
  pinWidget,
  type WidgetConfig,
} from '../../modules/home-widget';
import { AppText, Badge, Banner, Button, Card, IconBubble } from './ui';

const SHOW_LABEL: Record<WidgetConfig['show'], string> = {
  month: 'Spent this month',
  today: 'Spent today',
  left: 'Left this month',
  networth: 'Net worth',
  account: 'One account',
};

function readState() {
  return {
    widgets: getWidgetIds().map((id) => ({ id, config: getWidgetConfig(id) })),
    promoted: liveUpdatesAllowed(),
  };
}

/** Settings for the home screen widget and the Live Updates (OnePlus Live Alerts). */
export function WidgetSettings() {
  const liveSpending = useStore((s) => !!s.settings.liveSpending);
  const updateSettings = useStore((s) => s.updateSettings);
  const [state, setState] = useState(readState);
  const [error, setError] = useState<string | null>(null);
  const accounts = useStore((s) => s.accounts);

  // Widgets are added and removed on the home screen, outside the app.
  const refresh = useCallback(() => setState(readState()), []);
  useFocusEffect(
    useCallback(() => {
      refresh();
      const sub = AppState.addEventListener('change', (s) => {
        if (s === 'active') refresh();
      });
      return () => sub.remove();
    }, [refresh])
  );

  if (!isHomeWidgetAvailable) {
    return (
      <Card>
        <Banner
          tone="info"
          message={
            Platform.OS === 'android'
              ? 'The widget and Live Alerts need the latest app build. Install the updated APK to turn them on.'
              : 'The widget and Live Alerts work in the Android app only.'
          }
        />
      </Card>
    );
  }

  async function toggleLive() {
    setError(null);
    if (liveSpending) return updateSettings({ liveSpending: false });
    if (Platform.OS === 'android' && Number(Platform.Version) >= 33) {
      const result = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);
      if (result !== PermissionsAndroid.RESULTS.GRANTED) {
        return setError('Android did not allow notifications for Expense AI. Allow them in the app’s settings, then try again.');
      }
    }
    updateSettings({ liveSpending: true });
    refresh();
  }

  const accountName = (id: string | null) => accounts.find((a) => a.id === id)?.name ?? 'an account';

  return (
    <Card style={styles.card}>
      <View style={styles.row}>
        <IconBubble name="chart" tone={state.widgets.length ? 'lime' : 'mint'} />
        <View style={styles.fill}>
          <AppText variant="label">Home screen widget</AppText>
          <AppText variant="caption" color="textSecondary">
            {state.widgets.length
              ? `${state.widgets.length} on your home screen`
              : 'Not added yet'}
          </AppText>
        </View>
      </View>

      {state.widgets.map((w, i) => (
        <Button
          key={w.id}
          label={`Edit${state.widgets.length > 1 ? ` widget ${i + 1}` : ''}: ${
            w.config.show === 'account' ? accountName(w.config.accountId) : SHOW_LABEL[w.config.show]
          }`}
          icon="edit"
          variant="secondary"
          onPress={() => router.push({ pathname: '/widget', params: { id: String(w.id) } })}
        />
      ))}
      {canPinWidget() ? (
        <Button
          label={state.widgets.length ? 'Add another widget' : 'Add widget to home screen'}
          icon="plus"
          variant={state.widgets.length ? 'ghost' : 'primary'}
          onPress={() => pinWidget()}
        />
      ) : (
        <AppText variant="caption" color="textSecondary">
          To add it, long-press your home screen, tap Widgets, and drag Expense AI onto it.
        </AppText>
      )}

      <View style={[styles.row, styles.liveRow]}>
        <IconBubble name="sparkle" tone={liveSpending ? 'lime' : 'mint'} />
        <View style={styles.fill}>
          <AppText variant="label">Live Alerts</AppText>
          <AppText variant="caption" color="textSecondary">
            Today’s spending in the pill at the top of the screen, with the month’s progress when you
            expand it, and a progress bar while the AI sorts a big batch of messages.
          </AppText>
        </View>
        <Badge label={liveSpending ? 'On' : 'Off'} tone={liveSpending ? 'lime' : 'white'} />
      </View>
      <Button
        label={liveSpending ? 'Turn off' : 'Turn on'}
        variant={liveSpending ? 'secondary' : 'primary'}
        onPress={toggleLive}
      />
      {liveSpending && !state.promoted && (
        <Banner
          tone="info"
          message="It shows as a quiet notification. For the status bar pill, allow Live Updates (or Live Alerts) for Expense AI in its notification settings."
          action={{ label: 'Notification settings', onPress: openNotificationSettings }}
        />
      )}
      {error && <Banner tone="error" message={error} action={{ label: 'Open app settings', onPress: () => Linking.openSettings() }} />}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  liveRow: { marginTop: 6 },
  fill: { flex: 1 },
});
