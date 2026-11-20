import type { Account, Transaction } from './types';

/** Kinds whose bank messages state a real balance. Card alerts quote an available limit, not what is owed. */
const BALANCE_FROM_MESSAGES: readonly Account['kind'][] = ['bank', 'wallet'];

/** The trailing digits of a label like "HDFC ••4421" (at least 3, at most 4). */
export function digitsOf(label: string | null | undefined): string | null {
  const m = /(\d{3,})\D*$/.exec(label ?? '');
  return m ? m[1].slice(-4) : null;
}

/** Every ending that identifies an account: its own, and those of the bank's cards listed on it. */
function endingsOf(account: Account): string[] {
  return [account.last4, ...(account.cards ?? []).map((c) => c.last4)].filter((d): d is string => !!d);
}

/**
 * The portfolio account a message transaction belongs to, matched on its last digits: the
 * account's own ending, or one of its cards' (a card alert is filed under that card's bank).
 */
export function matchAccount(label: string | null | undefined, accounts: Account[]): Account | null {
  const digits = digitsOf(label);
  if (!digits) return null;
  const exact = accounts.filter((a) => endingsOf(a).includes(digits));
  if (exact.length === 1) return exact[0];
  // Banks sometimes show only 3 of the 4 digits ("XX902" for an account ending 0902).
  const loose = accounts.filter((a) => endingsOf(a).some((e) => e.endsWith(digits) || digits.endsWith(e)));
  return loose.length === 1 ? loose[0] : null;
}

/** Whether a message label names one of the account's credit cards rather than the account itself. */
function isCreditCardOf(account: Account, label: string | null | undefined) {
  const digits = digitsOf(label);
  return !!digits && (account.cards ?? []).some((c) => c.type === 'credit' && c.last4 === digits);
}

/** Points every message transaction at its account. Manual entries keep the account the user chose. */
export function linkTransactions(txns: Transaction[], accounts: Account[]): Transaction[] {
  const known = new Set(accounts.map((a) => a.id));
  const stillThere = (id: string | null | undefined) => (id && known.has(id) ? id : null);
  return txns.map((t) => {
    // A manual entry, or one the user edited, keeps the account the user chose.
    if (t.source === 'manual' || t.userEdited) return t;
    // The bank's own account ending is the strongest evidence. The AI's pick covers the rest:
    // accounts with no ending set, and platforms that never appear as digits at all.
    const accountId = matchAccount(t.account, accounts)?.id ?? stillThere(t.aiAccountId);
    const other = stillThere(t.aiToAccountId);
    const toAccountId = other !== accountId ? other : null;
    if ((t.accountId ?? null) === accountId && (t.toAccountId ?? null) === toAccountId) return t;
    return { ...t, accountId, toAccountId };
  });
}

/**
 * Takes each account's balance from its newest bank message that states one, when that message
 * is newer than the balance already on record. A hand-entered balance wins until a later message arrives.
 */
export function balancesFromMessages(txns: Transaction[], accounts: Account[]): Account[] {
  const latest = new Map<string, { at: number; balance: number }>();
  const byId = new Map(accounts.map((a) => [a.id, a]));
  for (const t of txns) {
    if (t.source === 'manual' || !t.accountId || t.balanceAfter === null) continue;
    // A credit card alert quotes the card's available limit, not the bank account's balance.
    const account = byId.get(t.accountId);
    if (account && isCreditCardOf(account, t.account)) continue;
    const at = Date.parse(t.date);
    const seen = latest.get(t.accountId);
    if (!seen || at > seen.at) latest.set(t.accountId, { at, balance: t.balanceAfter });
  }
  return accounts.map((a) => {
    const found = latest.get(a.id);
    if (!found || !BALANCE_FROM_MESSAGES.includes(a.kind) || found.at <= a.balanceUpdatedAt) return a;
    return { ...a, balance: found.balance, balanceUpdatedAt: found.at, balanceSource: 'sms' as const };
  });
}

export type NetWorth = {
  /** Assets minus what is owed, for accounts in the primary currency. */
  total: number;
  assets: number;
  owed: number;
  /** Accounts in another currency, which are listed but not added in. */
  otherCurrencyCount: number;
};

export function netWorth(accounts: Account[], currency: string): NetWorth {
  let assets = 0;
  let owed = 0;
  let otherCurrencyCount = 0;
  for (const a of accounts) {
    if (a.currency !== currency) otherCurrencyCount += 1;
    else if (a.kind === 'card') owed += a.balance;
    else assets += a.balance;
  }
  return { total: assets - owed, assets, owed, otherCurrencyCount };
}

/** How a debit or credit of `amount` changes an account's stored balance (cards hold a debt, so it flips). */
export function applyToBalance(account: Account, type: 'debit' | 'credit', amount: number): number {
  const outflow = type === 'debit' ? amount : -amount;
  return account.kind === 'card' ? account.balance + outflow : account.balance - outflow;
}

export type AccountSuggestion = { label: string; last4: string; count: number; balance: number | null };

/** Accounts that show up in bank messages but are not in the portfolio yet, busiest first. */
export function suggestAccounts(txns: Transaction[], accounts: Account[]): AccountSuggestion[] {
  const found = new Map<string, AccountSuggestion & { at: number }>();
  for (const t of txns) {
    if (t.source === 'manual' || t.source === 'demo' || t.accountId) continue;
    const last4 = digitsOf(t.account);
    if (!last4 || !t.account || matchAccount(t.account, accounts)) continue;
    const at = Date.parse(t.date);
    const entry = found.get(last4) ?? { label: t.account, last4, count: 0, balance: null, at: 0 };
    entry.count += 1;
    if (t.balanceAfter !== null && at > entry.at) {
      entry.balance = t.balanceAfter;
      entry.at = at;
    }
    found.set(last4, entry);
  }
  return [...found.values()]
    .sort((a, b) => b.count - a.count)
    .map(({ label, last4, count, balance }) => ({ label, last4, count, balance }));
}
