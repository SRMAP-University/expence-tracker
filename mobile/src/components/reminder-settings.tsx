import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { canSchedule, ensureReminderPermission } from '@/lib/reminders';
import { useStore } from '@/lib/store';

import { AppText, Banner, Button, Card } from './ui';

/** Settings card: reminders that arrive while the app is closed. */
export function ReminderSettings() {
  const bills = useStore((s) => !!s.settings.billReminders);
  const weekly = useStore((s) => s.settings.weeklySummaryReminder !== false);
  const updateSettings = useStore((s) => s.updateSettings);
  const [error, setError] = useState<string | null>(null);

  if (!canSchedule) {
    return (
      <Card>
        <AppText variant="caption" color="textSecondary">
          Bill and weekly-summary reminders need the latest app version (1.0.2).
        </AppText>
      </Card>
    );
  }

  async function toggle(key: 'billReminders' | 'weeklySummaryReminder', on: boolean) {
    setError(null);
    if (on && !(await ensureReminderPermission())) {
      return setError('Android did not allow notifications for Expense AI. Allow them in the app’s settings.');
    }
    updateSettings({ [key]: on });
  }

  return (
    <Card style={styles.card}>
      <Row
        title="Bills due tomorrow"
        detail="9 am the day before each bill or subscription."
        on={bills}
        onToggle={() => toggle('billReminders', !bills)}
      />
      <Row
        title="Weekly summary"
        detail="Monday 9 am, when last week’s summary is ready."
        on={weekly}
        onToggle={() => toggle('weeklySummaryReminder', !weekly)}
      />
      {error && <Banner tone="error" message={error} />}
    </Card>
  );
}

function Row({ title, detail, on, onToggle }: { title: string; detail: string; on: boolean; onToggle: () => void }) {
  return (
    <View style={styles.row}>
      <View style={styles.fill}>
        <AppText variant="label">{title}</AppText>
        <AppText variant="caption" color="textSecondary">
          {detail}
        </AppText>
      </View>
      <Button label={on ? 'On' : 'Off'} icon={on ? 'check' : undefined} variant={on ? 'primary' : 'secondary'} compact onPress={onToggle} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: 14 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  fill: { flex: 1 },
});
