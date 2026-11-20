import { netWorth } from './accounts';
import { monthKey, shiftMonth } from './format';
import type { Ledger } from './money';

export type NetWorthPoint = { month: string; value: number };

function endOfMonth(key: string) {
  const [y, m] = key.split('-').map(Number);
  return new Date(y, m, 0, 23, 59, 59, 999).getTime();
}

/**
 * Net worth at the end of each of the last `months` months, the last one being today.
 *
 * Only today's balances are known, so earlier months are worked out backwards: today's total,
 * minus every payment in and plus every payment out since that month ended, counting only
 * transactions filed under one of the accounts in the total. A move between two of the user's
 * own accounts changes nothing and is skipped. It is an estimate: a balance typed in by hand,
 * or spending the app never saw, makes the earlier months less exact.
 */
export function netWorthHistory(ledger: Ledger, now: Date, months = 12): NetWorthPoint[] {
  const { accounts, transactions, currency } = ledger;
  const counted = new Set(accounts.filter((a) => a.currency === currency).map((a) => a.id));
  const current = netWorth(accounts, currency).total;

  // Net effect on the total of each transaction: money in raises it, money out lowers it
  // (for a card, spending raises what is owed, which also lowers it).
  const flows = transactions
    .filter((t) => t.currency === currency && !!t.accountId && counted.has(t.accountId) && !t.toAccountId)
    .map((t) => ({ at: Date.parse(t.date), change: t.type === 'credit' ? t.amount : -t.amount }));

  const thisMonth = monthKey(now);
  const points: NetWorthPoint[] = [];
  for (let i = months - 1; i >= 1; i--) {
    const month = shiftMonth(thisMonth, -i);
    const end = endOfMonth(month);
    const since = flows.filter((f) => f.at > end).reduce((sum, f) => sum + f.change, 0);
    points.push({ month, value: current - since });
  }
  points.push({ month: thisMonth, value: current });
  return points;
}
