import { detectRecurring, monthlyEquivalent, type RecurringPayment } from './analytics';
import type { Transaction } from './types';

const DAY = 86_400_000;

export type Bill = RecurringPayment & {
  /** Whole days from today to the next expected payment; negative when it is late. */
  dueInDays: number;
  /**
   * upcoming: due ahead. late: expected in the last few days but not seen yet.
   * lapsed: well overdue, probably cancelled.
   */
  status: 'upcoming' | 'late' | 'lapsed';
  /** What it costs per month, whatever its cadence. */
  monthly: number;
};

function startOfDay(date: Date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** How late a payment can be before it looks cancelled: a few days, or a week for yearly ones. */
function graceDays(cadence: RecurringPayment['cadence']) {
  return cadence === 'weekly' ? 3 : cadence === 'monthly' ? 7 : 21;
}

/**
 * Bills and subscriptions, found from regular payments (same merchant, similar amount, regular
 * interval), with when each is next due. Soonest first; probably cancelled ones last.
 */
export function findBills(transactions: Transaction[], now: Date): Bill[] {
  const today = startOfDay(now);
  return detectRecurring(transactions)
    .map((r): Bill => {
      const dueInDays = Math.round((startOfDay(new Date(r.nextDate)) - today) / DAY);
      const status = dueInDays >= 0 ? 'upcoming' : -dueInDays <= graceDays(r.cadence) ? 'late' : 'lapsed';
      return { ...r, dueInDays, status, monthly: monthlyEquivalent(r) };
    })
    .sort((a, b) => {
      if ((a.status === 'lapsed') !== (b.status === 'lapsed')) return a.status === 'lapsed' ? 1 : -1;
      return a.dueInDays - b.dueInDays;
    });
}

/** The monthly cost of everything still running, in one currency. */
export function monthlyBillsTotal(bills: Bill[], currency: string) {
  return bills
    .filter((b) => b.status !== 'lapsed' && b.currency === currency)
    .reduce((sum, b) => sum + b.monthly, 0);
}

/** "today", "tomorrow", "in 5 days", "2 days late". */
export function dueLabel(bill: Bill) {
  if (bill.status === 'lapsed') return 'maybe cancelled';
  if (bill.dueInDays < 0) return `${-bill.dueInDays} day${bill.dueInDays === -1 ? '' : 's'} late`;
  if (bill.dueInDays === 0) return 'due today';
  if (bill.dueInDays === 1) return 'due tomorrow';
  return `in ${bill.dueInDays} days`;
}

export const CADENCE_LABEL: Record<RecurringPayment['cadence'], string> = {
  weekly: 'Weekly',
  monthly: 'Monthly',
  yearly: 'Yearly',
};
