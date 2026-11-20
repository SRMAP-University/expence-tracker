import { countsTowardTotals } from './analytics';
import { localDay } from './widget-data';
import type { Transaction } from './types';

const DAY = 86_400_000;

/** Monday 00:00 of the week `date` falls in, local time. */
export function weekStart(date: Date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const sinceMonday = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - sinceMonday);
  return d;
}

/** The last full week (Monday to Sunday) before `now`. */
export function lastWeek(now: Date) {
  const end = weekStart(now);
  const start = new Date(end);
  start.setDate(start.getDate() - 7);
  return { start, end, key: localDay(start) };
}

type Range = { start: Date; end: Date };

function spendIn(txns: Transaction[], range: Range, currency: string) {
  return txns.filter((t) => {
    const at = Date.parse(t.date);
    return t.currency === currency && at >= range.start.getTime() && at < range.end.getTime();
  });
}

/**
 * What the AI is given to write the weekly summary: last week's totals by category, the four
 * weeks before as a baseline, and the biggest payments. Figures only, never message text.
 */
export function weeklyPayload(txns: Transaction[], now: Date, currency: string) {
  const week = lastWeek(now);
  const inWeek = spendIn(txns, week, currency);
  const spending = inWeek.filter((t) => t.type === 'debit' && countsTowardTotals(t));
  const spent = spending.reduce((s, t) => s + t.amount, 0);
  const income = inWeek
    .filter((t) => t.type === 'credit' && countsTowardTotals(t))
    .reduce((s, t) => s + t.amount, 0);

  const byCategory = new Map<string, number>();
  for (const t of spending) byCategory.set(t.category, (byCategory.get(t.category) ?? 0) + t.amount);

  // The four weeks before, as "a usual week".
  const before = { start: new Date(week.start.getTime() - 28 * DAY), end: week.start };
  const baseline = spendIn(txns, before, currency).filter((t) => t.type === 'debit' && countsTowardTotals(t));
  const usualWeek = baseline.reduce((s, t) => s + t.amount, 0) / 4;
  const usualByCategory = new Map<string, number>();
  for (const t of baseline) usualByCategory.set(t.category, (usualByCategory.get(t.category) ?? 0) + t.amount / 4);

  const round = (n: number) => Math.round(n * 100) / 100;
  return {
    week: { from: localDay(week.start), to: localDay(new Date(week.end.getTime() - DAY)) },
    currency,
    spent: round(spent),
    income: round(income),
    usualWeeklySpend: round(usualWeek),
    transactions: spending.length,
    categories: [...byCategory.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([category, amount]) => ({
        category,
        amount: round(amount),
        usualWeekly: round(usualByCategory.get(category) ?? 0),
      })),
    biggest: [...spending]
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 3)
      .map((t) => ({ merchant: t.merchant, amount: round(t.amount), category: t.category })),
  };
}

export type WeeklyPayload = ReturnType<typeof weeklyPayload>;
