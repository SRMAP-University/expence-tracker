import { monthKey, shiftMonth } from './format';
import { netWorth } from './accounts';
import { ACCOUNT_KIND_LABEL, NEUTRAL_CATEGORIES, type Account, type Category, type Transaction } from './types';

export type CategoryTotal = { category: Category; amount: number; count: number };
export type MerchantTotal = { merchant: string; amount: number; count: number };

export type MonthSummary = {
  month: string;
  currency: string;
  spent: number;
  income: number;
  net: number;
  count: number;
  byCategory: CategoryTotal[];
  topMerchants: MerchantTotal[];
  /** Transactions this month in a currency other than the primary one (not included in totals). */
  otherCurrencyCount: number;
};

export function countsTowardTotals(t: Transaction) {
  return !NEUTRAL_CATEGORIES.includes(t.category);
}

export function transactionsInMonth(txns: Transaction[], month: string) {
  return txns.filter((t) => monthKey(t.date) === month);
}

export function summarizeMonth(txns: Transaction[], month: string, currency: string): MonthSummary {
  const inMonth = transactionsInMonth(txns, month);
  const primary = inMonth.filter((t) => t.currency === currency);
  let spent = 0;
  let income = 0;
  const categories = new Map<Category, CategoryTotal>();
  const merchants = new Map<string, MerchantTotal>();

  for (const t of primary) {
    if (!countsTowardTotals(t)) continue;
    if (t.type === 'credit') {
      income += t.amount;
      continue;
    }
    spent += t.amount;
    const c = categories.get(t.category) ?? { category: t.category, amount: 0, count: 0 };
    c.amount += t.amount;
    c.count += 1;
    categories.set(t.category, c);
    const key = t.merchant.trim().toLowerCase();
    const m = merchants.get(key) ?? { merchant: t.merchant, amount: 0, count: 0 };
    m.amount += t.amount;
    m.count += 1;
    merchants.set(key, m);
  }

  return {
    month,
    currency,
    spent,
    income,
    net: income - spent,
    count: primary.length,
    byCategory: [...categories.values()].sort((a, b) => b.amount - a.amount),
    topMerchants: [...merchants.values()].sort((a, b) => b.amount - a.amount).slice(0, 8),
    otherCurrencyCount: inMonth.length - primary.length,
  };
}

export function monthlyTotals(txns: Transaction[], currency: string, months: number, endMonth = monthKey(new Date())) {
  const keys = Array.from({ length: months }, (_, i) => shiftMonth(endMonth, i - months + 1));
  return keys.map((key) => {
    const s = summarizeMonth(txns, key, currency);
    return { month: key, spent: s.spent, income: s.income };
  });
}

export type Metric = 'spent' | 'income' | 'saved';

/**
 * Running total of a metric through the month, sampled to at most `maxPoints` values.
 * Starts at 0 and, for the current month, ends at today rather than padding out the future.
 */
export function cumulativeSeries(
  txns: Transaction[],
  month: string,
  currency: string,
  metric: Metric,
  maxPoints = 14
): number[] {
  const [y, m] = month.split('-').map(Number);
  const now = new Date();
  const lastDay = monthKey(now) === month ? now.getDate() : new Date(y, m, 0).getDate();
  const daily = new Array<number>(lastDay + 1).fill(0);

  for (const t of txns) {
    if (t.currency !== currency || monthKey(t.date) !== month || !countsTowardTotals(t)) continue;
    const day = Math.min(new Date(t.date).getDate(), lastDay);
    if (metric === 'spent') daily[day] += t.type === 'debit' ? t.amount : 0;
    else if (metric === 'income') daily[day] += t.type === 'credit' ? t.amount : 0;
    else daily[day] += t.type === 'credit' ? t.amount : -t.amount;
  }

  const running: number[] = [];
  let total = 0;
  for (const amount of daily) {
    total += amount;
    running.push(total);
  }
  const n = Math.min(maxPoints, running.length);
  if (n < 2) return [0, total];
  return Array.from({ length: n }, (_, i) => running[Math.round((i / (n - 1)) * lastDay)]);
}

export type RecurringPayment = {
  merchant: string;
  category: Category;
  amount: number;
  currency: string;
  cadence: 'weekly' | 'monthly' | 'yearly';
  occurrences: number;
  lastDate: string;
  nextDate: string;
};

const DAY = 86_400_000;

function median(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** Same merchant, similar amount, regular interval => recurring (subscriptions, rent, EMIs, SIPs). */
export function detectRecurring(txns: Transaction[]): RecurringPayment[] {
  const groups = new Map<string, Transaction[]>();
  for (const t of txns) {
    if (t.type !== 'debit' || t.category === 'Transfers') continue;
    const key = `${t.merchant.trim().toLowerCase()}|${t.currency}`;
    const list = groups.get(key) ?? [];
    list.push(t);
    groups.set(key, list);
  }

  const results: RecurringPayment[] = [];
  for (const list of groups.values()) {
    if (list.length < 2) continue;
    const sorted = [...list].sort((a, b) => Date.parse(a.date) - Date.parse(b.date));
    const typical = median(sorted.map((t) => t.amount));
    const similar = sorted.filter((t) => Math.abs(t.amount - typical) <= typical * 0.15);
    if (similar.length < 2) continue;

    const gaps = similar.slice(1).map((t, i) => (Date.parse(t.date) - Date.parse(similar[i].date)) / DAY);
    const gap = median(gaps);
    let cadence: RecurringPayment['cadence'] | null = null;
    if (gap >= 5 && gap <= 9) cadence = 'weekly';
    else if (gap >= 25 && gap <= 35) cadence = 'monthly';
    else if (gap >= 350 && gap <= 380) cadence = 'yearly';
    if (!cadence) continue;
    // Weekly needs more evidence than two data points.
    if (cadence === 'weekly' && similar.length < 3) continue;

    const last = similar[similar.length - 1];
    const periodDays = cadence === 'weekly' ? 7 : cadence === 'monthly' ? 30 : 365;
    results.push({
      merchant: last.merchant,
      category: last.category,
      amount: last.amount,
      currency: last.currency,
      cadence,
      occurrences: similar.length,
      lastDate: last.date,
      nextDate: new Date(Date.parse(last.date) + periodDays * DAY).toISOString(),
    });
  }
  return results.sort((a, b) => b.amount - a.amount);
}

export function monthlyEquivalent(r: RecurringPayment) {
  if (r.cadence === 'weekly') return (r.amount * 52) / 12;
  if (r.cadence === 'yearly') return r.amount / 12;
  return r.amount;
}

/** Compact payload for the insights prompt: aggregates only, no raw message text. */
export function buildInsightsPayload(txns: Transaction[], month: string, currency: string) {
  const current = summarizeMonth(txns, month, currency);
  const previous = summarizeMonth(txns, shiftMonth(month, -1), currency);
  const prevByCategory = new Map(previous.byCategory.map((c) => [c.category, c.amount]));
  const round = (n: number) => Math.round(n * 100) / 100;
  const largest = transactionsInMonth(txns, month)
    .filter((t) => t.type === 'debit' && t.currency === currency && t.category !== 'Transfers')
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 5);

  return {
    month,
    currency,
    totals: { spent: round(current.spent), income: round(current.income), net: round(current.net), transactions: current.count },
    previousMonth: previous.count ? { spent: round(previous.spent), income: round(previous.income) } : null,
    byCategory: current.byCategory.map((c) => ({
      category: c.category,
      amount: round(c.amount),
      shareOfSpend: current.spent ? round((c.amount / current.spent) * 100) : 0,
      previousMonthAmount: round(prevByCategory.get(c.category) ?? 0),
    })),
    topMerchants: current.topMerchants.map((m) => ({ ...m, amount: round(m.amount) })),
    recurring: detectRecurring(txns)
      .filter((r) => r.currency === currency)
      .map((r) => ({ merchant: r.merchant, amount: r.amount, cadence: r.cadence, category: r.category })),
    largestPurchases: largest.map((t) => ({
      merchant: t.merchant,
      amount: t.amount,
      category: t.category,
      date: t.date.slice(0, 10),
    })),
  };
}

/** Text block the chat assistant reasons over: monthly rollups plus recent transactions as CSV. */
export function buildChatContext(txns: Transaction[], currency: string, accounts: Account[] = []) {
  const worth = netWorth(accounts, currency);
  const holdings = accounts
    .map((a) => `${a.name} (${ACCOUNT_KIND_LABEL[a.kind].toLowerCase()}): ${a.balance.toFixed(2)} ${a.currency}`)
    .join('\n');
  const totals = monthlyTotals(txns, currency, 6)
    .map((m) => `${m.month}: spent ${m.spent.toFixed(2)}, income ${m.income.toFixed(2)}`)
    .join('\n');
  const thisMonth = summarizeMonth(txns, monthKey(new Date()), currency);
  const categories = thisMonth.byCategory.map((c) => `${c.category}: ${c.amount.toFixed(2)}`).join('\n');
  const recurring = detectRecurring(txns)
    .map((r) => `${r.merchant}: ${r.amount} ${r.currency} ${r.cadence}`)
    .join('\n');
  const rows = txns
    .slice(0, 600)
    .map((t) =>
      [t.date.slice(0, 10), t.type, t.amount, t.currency, t.merchant.replace(/,/g, ' '), t.category, t.account ?? ''].join(',')
    )
    .join('\n');

  return `PRIMARY CURRENCY: ${currency} (totals below exclude "Transfers" between own accounts)

ACCOUNTS THE USER HOLDS (credit card balances are amounts owed):
${holdings || 'none listed'}
NET WORTH: ${worth.total.toFixed(2)} ${currency}

MONTHLY TOTALS (last 6 months):
${totals}

THIS MONTH BY CATEGORY:
${categories || 'none'}

DETECTED RECURRING PAYMENTS:
${recurring || 'none'}

TRANSACTIONS (newest first; date,type,amount,currency,merchant,category,account):
${rows || 'none'}`;
}
