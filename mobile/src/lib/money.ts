import { getLocales } from 'expo-localization';

import type { Account, Settings, Transaction } from './types';

/**
 * Amounts are stored in the currency they happened in and converted only for display,
 * so changing the display currency or a rate never rewrites history.
 */

/** Units of each currency that equal 1 US dollar, e.g. { INR: 100 }. USD itself is always 1. */
export type Rates = Record<string, number>;

export const DEFAULT_CURRENCY = 'USD';
export const DEFAULT_RATES: Rates = { INR: 100 };

/** The currency of the phone's region: the right guess for a bank message that names none. */
export function deviceCurrency() {
  try {
    return getLocales()[0]?.currencyCode ?? DEFAULT_CURRENCY;
  } catch {
    return DEFAULT_CURRENCY;
  }
}

/**
 * The few currencies worth offering in a form's currency switch: the display currency, those
 * with a rate, and the phone's own, always including `selected`. At most four.
 */
export function currencyChoices(selected: string, display: string, rates: Rates) {
  const choices = [...new Set([display, ...Object.keys(rates), deviceCurrency()])].slice(0, 4);
  if (!choices.includes(selected)) choices.splice(Math.min(choices.length, 3), 1, selected);
  return choices;
}

function perDollar(currency: string, rates: Rates) {
  return currency === 'USD' ? 1 : rates[currency];
}

/** Converts between two currencies through USD. Null when either side has no rate. */
export function convert(amount: number, from: string, to: string, rates: Rates): number | null {
  if (from === to) return amount;
  const fromRate = perDollar(from, rates);
  const toRate = perDollar(to, rates);
  if (!fromRate || !toRate || fromRate <= 0 || toRate <= 0) return null;
  return Math.round((amount / fromRate) * toRate * 100) / 100;
}

export type DisplayAccount = Account & {
  /** Present when the balance shown was converted from another currency. */
  original?: { balance: number; currency: string };
};

/** The transaction as shown: in the display currency when a rate exists, untouched otherwise. */
export function toDisplayTransaction(t: Transaction, currency: string, rates: Rates): Transaction {
  if (t.currency === currency) return t;
  const amount = convert(t.amount, t.currency, currency, rates);
  if (amount === null) return t;
  return {
    ...t,
    amount,
    currency,
    balanceAfter: t.balanceAfter === null ? null : convert(t.balanceAfter, t.currency, currency, rates),
    original: { amount: t.amount, currency: t.currency },
  };
}

export function toDisplayAccount(a: Account, currency: string, rates: Rates): DisplayAccount {
  if (a.currency === currency) return a;
  const balance = convert(a.balance, a.currency, currency, rates);
  if (balance === null) return a;
  return { ...a, balance, currency, original: { balance: a.balance, currency: a.currency } };
}

export type Ledger = {
  currency: string;
  transactions: Transaction[];
  accounts: DisplayAccount[];
};

/** Everything the screens, charts and AI summaries read: stored data, in the display currency. */
export function buildLedger(state: { transactions: Transaction[]; accounts: Account[]; settings: Settings }): Ledger {
  const { currency, rates } = state.settings;
  return {
    currency,
    transactions: state.transactions.map((t) => toDisplayTransaction(t, currency, rates)),
    accounts: state.accounts.map((a) => toDisplayAccount(a, currency, rates)),
  };
}

/** Currencies in the data that need a rate to be shown in the display currency. */
export function foreignCurrencies(state: { transactions: Transaction[]; accounts: Account[]; settings: Settings }) {
  const found = new Set<string>(Object.keys(state.settings.rates));
  for (const t of state.transactions) found.add(t.currency);
  for (const a of state.accounts) found.add(a.currency);
  found.add(state.settings.currency);
  found.delete('USD');
  return [...found].sort();
}
