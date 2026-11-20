import { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Drawer, FieldLabel } from '@/components/drawer';
import { BillRow } from '@/components/upcoming-bills';
import { AppText, Banner, Button, Card, Divider } from '@/components/ui';
import { Colors, Font } from '@/constants/theme';
import { useLedger } from '@/hooks/use-ledger';
import { CADENCE_LABEL, findBills, monthlyBillsTotal, type Bill } from '@/lib/bills';
import { formatMoney } from '@/lib/format';
import { canSchedule, ensureReminderPermission } from '@/lib/reminders';
import { useStore } from '@/lib/store';

function currentBills(transactions: Parameters<typeof findBills>[0]) {
  return findBills(transactions, new Date());
}

/** Every bill and subscription the app has spotted, what they cost a month, and reminders. */
export default function BillsScreen() {
  const { transactions, currency } = useLedger();
  const bills = useMemo(() => currentBills(transactions), [transactions]);
  const reminders = useStore((s) => !!s.settings.billReminders);
  const updateSettings = useStore((s) => s.updateSettings);
  const [error, setError] = useState<string | null>(null);

  const soon = bills.filter((b) => b.status !== 'lapsed' && b.dueInDays <= 30);
  const later = bills.filter((b) => b.status !== 'lapsed' && b.dueInDays > 30);
  const lapsed = bills.filter((b) => b.status === 'lapsed');
  const monthly = monthlyBillsTotal(bills, currency);

  async function toggleReminders() {
    setError(null);
    if (reminders) return updateSettings({ billReminders: false });
    if (!(await ensureReminderPermission())) {
      return setError('Android did not allow notifications for Expense AI. Allow them in the app’s settings.');
    }
    updateSettings({ billReminders: true });
  }

  return (
    <Drawer
      title="Bills & subscriptions"
      subtitle={bills.length ? `About ${formatMoney(monthly, currency)} a month` : undefined}
      fallback="/">
      {bills.length === 0 ? (
        <AppText variant="body" color="textSecondary" style={styles.empty}>
          None found yet. Payments that repeat (same merchant, similar amount, every week, month or year)
          show up here after the second time.
        </AppText>
      ) : (
        <>
          <Section title="Next 30 days" bills={soon} />
          <Section title="Later" bills={later} />
          <Section title="Maybe cancelled" bills={lapsed} note="Not seen when expected." />
        </>
      )}

      {canSchedule ? (
        <Card style={styles.reminders}>
          <View style={styles.reminderText}>
            <AppText variant="label">Reminders</AppText>
            <AppText variant="caption" color="textSecondary">
              A notification at 9 am the day before each bill is due.
            </AppText>
          </View>
          <Button
            label={reminders ? 'On' : 'Turn on'}
            icon={reminders ? 'check' : undefined}
            variant={reminders ? 'secondary' : 'primary'}
            compact
            onPress={toggleReminders}
          />
        </Card>
      ) : (
        <AppText variant="caption" color="textTertiary">
          Reminders need the latest app version (1.0.2).
        </AppText>
      )}
      {error && <Banner tone="error" message={error} />}
    </Drawer>
  );
}

function Section({ title, bills, note }: { title: string; bills: Bill[]; note?: string }) {
  if (!bills.length) return null;
  return (
    <View style={styles.section}>
      <FieldLabel>{title}</FieldLabel>
      {note && (
        <AppText variant="caption" color="textTertiary">
          {note}
        </AppText>
      )}
      <Card padded={false}>
        {bills.map((bill, i) => (
          <View key={`${bill.merchant}-${bill.currency}`}>
            {i > 0 && <Divider inset={16} />}
            <BillRow bill={bill} />
            <Text style={styles.cadence}>
              {CADENCE_LABEL[bill.cadence]} · paid {bill.occurrences} times
            </Text>
          </View>
        ))}
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  empty: { textAlign: 'center', paddingVertical: 24 },
  section: { gap: 8 },
  cadence: {
    fontFamily: Font.medium,
    fontSize: 11,
    color: Colors.textTertiary,
    paddingLeft: 66,
    marginTop: -8,
    paddingBottom: 10,
  },
  reminders: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  reminderText: { flex: 1, gap: 2 },
});
