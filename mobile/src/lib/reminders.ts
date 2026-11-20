import { requireOptionalNativeModule } from 'expo';
import { Platform } from 'react-native';

import type { Bill } from './bills';
import { formatMoney } from './format';

/**
 * Reminders that arrive while the app is closed: the day before a bill, and Monday's weekly
 * summary. They need the notification library, which app builds before 1.0.2 do not include;
 * it is loaded only when the build has it, so older builds simply offer no reminders.
 */
export const canSchedule =
  Platform.OS !== 'web' && requireOptionalNativeModule('ExpoNotificationScheduler') != null;

const CHANNEL = 'reminders';
const BILL_PREFIX = 'bill:';
const WEEKLY_ID = 'weekly-summary';
/** Bills further out than this are scheduled on a later visit. */
const HORIZON_DAYS = 45;

async function notifications() {
  const N = await import('expo-notifications');
  await N.setNotificationChannelAsync(CHANNEL, {
    name: 'Reminders',
    description: 'Bills due tomorrow, and the weekly summary.',
    importance: N.AndroidImportance.DEFAULT,
  });
  return N;
}

/** Asks for permission to notify, if not already given. */
export async function ensureReminderPermission(): Promise<boolean> {
  if (!canSchedule) return false;
  const N = await notifications();
  const current = await N.getPermissionsAsync();
  if (current.granted) return true;
  return (await N.requestPermissionsAsync()).granted;
}

/** Replaces all bill reminders: 9 am the day before each bill due in the next few weeks. */
export async function scheduleBillReminders(bills: Bill[], enabled: boolean) {
  if (!canSchedule) return;
  const N = await notifications();
  const scheduled = await N.getAllScheduledNotificationsAsync();
  await Promise.all(
    scheduled
      .filter((n) => n.identifier.startsWith(BILL_PREFIX))
      .map((n) => N.cancelScheduledNotificationAsync(n.identifier))
  );
  if (!enabled || !(await N.getPermissionsAsync()).granted) return;

  const now = Date.now();
  for (const bill of bills) {
    if (bill.status !== 'upcoming' || bill.dueInDays < 1 || bill.dueInDays > HORIZON_DAYS) continue;
    const at = new Date(bill.nextDate);
    at.setDate(at.getDate() - 1);
    at.setHours(9, 0, 0, 0);
    if (at.getTime() <= now) continue;
    await N.scheduleNotificationAsync({
      identifier: `${BILL_PREFIX}${bill.merchant}`.slice(0, 120),
      content: {
        title: `${bill.merchant} is due tomorrow`,
        body: `${formatMoney(bill.amount, bill.currency)} · ${bill.category}`,
      },
      trigger: { type: N.SchedulableTriggerInputTypes.DATE, date: at, channelId: CHANNEL },
    });
  }
}

/** Monday 9 am: "Your week in money is ready". */
export async function scheduleWeeklySummaryReminder(enabled: boolean) {
  if (!canSchedule) return;
  const N = await notifications();
  await N.cancelScheduledNotificationAsync(WEEKLY_ID).catch(() => {});
  if (!enabled || !(await N.getPermissionsAsync()).granted) return;
  await N.scheduleNotificationAsync({
    identifier: WEEKLY_ID,
    content: { title: 'Your week in money', body: 'Last week’s summary is ready. Tap to see it.' },
    // Weekday 2 is Monday (1 is Sunday).
    trigger: { type: N.SchedulableTriggerInputTypes.WEEKLY, weekday: 2, hour: 9, minute: 0, channelId: CHANNEL },
  });
}
