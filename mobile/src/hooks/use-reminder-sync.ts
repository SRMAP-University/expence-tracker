import { useEffect } from 'react';

import { useLedger } from '@/hooks/use-ledger';
import { findBills } from '@/lib/bills';
import { canSchedule, scheduleBillReminders, scheduleWeeklySummaryReminder } from '@/lib/reminders';
import { useStore } from '@/lib/store';

/** Bills change as transactions arrive; reschedule once things settle. */
const SETTLE_MS = 3_000;

/** Keeps the scheduled reminders (bills, weekly summary) in step with the data and settings. */
export function useReminderSync() {
  const { transactions } = useLedger();
  const billReminders = useStore((s) => !!s.settings.billReminders);
  const weeklyReminder = useStore((s) => s.settings.weeklySummaryReminder !== false);

  useEffect(() => {
    if (!canSchedule) return;
    const timer = setTimeout(() => {
      if (!useStore.persist.hasHydrated()) return;
      scheduleBillReminders(findBills(transactions, new Date()), billReminders).catch(() => {});
    }, SETTLE_MS);
    return () => clearTimeout(timer);
  }, [transactions, billReminders]);

  useEffect(() => {
    if (!canSchedule) return;
    scheduleWeeklySummaryReminder(weeklyReminder).catch(() => {});
  }, [weeklyReminder]);
}
