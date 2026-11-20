import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { applyToBalance, balancesFromMessages, linkTransactions } from './accounts';
import { newId } from './format';
import { DEFAULT_CURRENCY, DEFAULT_RATES } from './money';
import { DEFAULT_MODEL } from './openai';
import { persistStorage } from './storage';
import type {
  Account,
  AccountKind,
  BankCard,
  CalcEntry,
  WeeklySummary,
  Category,
  ChatMessage,
  MonthInsights,
  Settings,
  Transaction,
  TxnType,
} from './types';

/** Calculator history kept on the phone; the oldest drop off beyond this. */
const MAX_CALC_HISTORY = 200;

export type AccountInput = {
  name: string;
  kind: AccountKind;
  last4: string | null;
  balance: number;
  currency: string;
  holderName?: string | null;
  cards?: BankCard[];
  hasLogin?: boolean;
};

/** The fields of a transaction the user (through the assistant) can change. */
export type TransactionPatch = Partial<
  Pick<Transaction, 'merchant' | 'amount' | 'currency' | 'category' | 'date' | 'type' | 'accountId' | 'toAccountId' | 'note'>
>;

export type CloudBackupState = { connected: boolean; lastBackupAt: number | null; error: string | null };

export type DataSnapshot = {
  transactions: Transaction[];
  accounts: Account[];
  settings: Settings;
  /** Messages already read; restored too, so undoing an import lets it be imported again. */
  processed?: Record<string, true>;
};

export type ManualEntry = {
  /** `transfer` moves money between two of the user's own accounts. */
  kind: 'expense' | 'income' | 'transfer';
  amount: number;
  /** Currency the amount was typed in. */
  currency: string;
  description: string;
  category: Category;
  /** ISO 8601 timestamp. */
  date: string;
  accountId: string | null;
  toAccountId: string | null;
  note: string | null;
  /** Adjust the chosen accounts' balances by this amount. */
  updateBalance: boolean;
};

type State = {
  transactions: Transaction[];
  accounts: Account[];
  /** Accounts changed since messages were last analysed, so transfers between them may be mislabelled. */
  accountsChanged: boolean;
  /** Message ids already analysed (including ones that turned out not to be transactions). */
  processed: Record<string, true>;
  lastSmsSyncAt: number | null;
  /** Connected Gmail address, or null. Google holds the actual sign-in. */
  gmailEmail: string | null;
  lastEmailSyncAt: number | null;
  /** Google stopped giving access (expired or revoked); signing in again fixes it. */
  gmailNeedsReconnect: boolean;
  /** A read-only Binance key is saved (the key itself lives in secure storage). */
  binanceConnected: boolean;
  /** The portfolio account Binance records are filed under. */
  binanceAccountId: string | null;
  lastBinanceSyncAt: number | null;
  /** Binance stopped accepting the key (deleted or changed); reconnecting fixes it. */
  binanceNeedsReconnect: boolean;
  insights: Record<string, MonthInsights>;
  chat: ChatMessage[];
  /** Calculator history, newest first. */
  calcHistory: CalcEntry[];
  /** The latest weekly summary. */
  weeklySummary: WeeklySummary | null;
  /** Backup to the website's database: whether this phone is paired, and how the last one went. */
  cloudBackup: CloudBackupState;
  settings: Settings;
};

type Actions = {
  upsertTransactions: (txns: Transaction[]) => number;
  removeTransactions: (ids: string[]) => void;
  markProcessed: (ids: string[]) => void;
  setCategory: (id: string, category: Category) => void;
  deleteTransaction: (id: string) => void;
  /**
   * Changes a transaction's fields, as the user asked. A manual entry's effect on its account
   * balances moves with it.
   */
  updateTransaction: (id: string, patch: TransactionPatch) => void;
  /** Puts transactions, accounts and settings back as they were, e.g. to undo the assistant. */
  restoreData: (snapshot: DataSnapshot) => void;
  addManualTransaction: (entry: ManualEntry) => void;
  /** `id` lets a form pick the id up front, e.g. to save the account's login under it first. */
  addAccount: (input: AccountInput, id?: string) => string;
  updateAccount: (id: string, input: AccountInput) => void;
  deleteAccount: (id: string) => void;
  setAccountsChanged: (changed: boolean) => void;
  setLastSmsSyncAt: (ms: number | null) => void;
  setGmailAccount: (email: string | null) => void;
  setLastEmailSyncAt: (ms: number | null) => void;
  setGmailNeedsReconnect: (needed: boolean) => void;
  setBinance: (connected: boolean, accountId: string | null) => void;
  setLastBinanceSyncAt: (ms: number | null) => void;
  setBinanceNeedsReconnect: (needed: boolean) => void;
  /** Sets a balance reported by an exchange API, in its own currency. */
  setApiBalance: (accountId: string, balance: number, currency: string) => void;
  setInsights: (insights: MonthInsights) => void;
  appendChat: (message: ChatMessage) => void;
  updateChatMessage: (id: string, patch: Partial<ChatMessage>) => void;
  clearChat: () => void;
  addCalcEntry: (entry: CalcEntry) => void;
  setWeeklySummary: (summary: WeeklySummary | null) => void;
  setCloudBackup: (patch: Partial<CloudBackupState>) => void;
  clearCalcHistory: () => void;
  updateSettings: (patch: Partial<Settings>) => void;
  resetSyncState: () => void;
  clearAllData: () => void;
};

const initialState = (): State => ({
  transactions: [],
  accounts: [],
  accountsChanged: false,
  processed: {},
  lastSmsSyncAt: null,
  gmailEmail: null,
  lastEmailSyncAt: null,
  gmailNeedsReconnect: false,
  binanceConnected: false,
  binanceAccountId: null,
  lastBinanceSyncAt: null,
  binanceNeedsReconnect: false,
  insights: {},
  chat: [],
  calcHistory: [],
  weeklySummary: null,
  cloudBackup: { connected: false, lastBackupAt: null, error: null },
  settings: {
    name: '',
    model: DEFAULT_MODEL,
    currency: DEFAULT_CURRENCY,
    rates: { ...DEFAULT_RATES },
    lookbackDays: 90,
  },
});

const byDateDesc = (a: Transaction, b: Transaction) => Date.parse(b.date) - Date.parse(a.date);

/** Re-links message transactions to accounts and refreshes balances that bank messages report. */
function relink(transactions: Transaction[], accounts: Account[]) {
  const linked = linkTransactions(transactions, accounts);
  return { transactions: linked, accounts: balancesFromMessages(linked, accounts) };
}

/** Applies (or, with `sign` -1, undoes) a manual entry's effect on its accounts' balances. */
function adjustBalances(accounts: Account[], txn: Transaction, sign: 1 | -1): Account[] {
  const now = Date.now();
  return accounts.map((a) => {
    let type: TxnType | null = null;
    if (a.id === txn.accountId) type = txn.type;
    // The receiving side of a transfer gets the money the other side lost.
    else if (a.id === txn.toAccountId) type = 'credit';
    if (!type) return a;
    const effective: TxnType = sign === 1 ? type : type === 'debit' ? 'credit' : 'debit';
    return {
      ...a,
      balance: applyToBalance(a, effective, txn.amount),
      balanceUpdatedAt: now,
      balanceSource: 'manual' as const,
    };
  });
}

export const useStore = create<State & Actions>()(
  persist(
    (set, get) => ({
      ...initialState(),

      upsertTransactions: (incoming) => {
        if (!incoming.length) return 0;
        const map = new Map(get().transactions.map((t) => [t.id, t]));
        let added = 0;
        for (const t of incoming) {
          const existing = map.get(t.id);
          if (!existing) added += 1;
          // Never let re-analysis overwrite what the user changed: an edited transaction stays as it
          // is, and a category picked by hand is kept.
          if (existing?.userEdited) continue;
          map.set(
            t.id,
            existing?.categoryLocked ? { ...t, category: existing.category, categoryLocked: true } : t
          );
        }
        set(relink([...map.values()].sort(byDateDesc), get().accounts));
        return added;
      },

      removeTransactions: (ids) => {
        const drop = new Set(ids);
        set({ transactions: get().transactions.filter((t) => !drop.has(t.id)) });
      },

      markProcessed: (ids) => {
        if (!ids.length) return;
        const processed = { ...get().processed };
        for (const id of ids) processed[id] = true;
        set({ processed });
      },

      setCategory: (id, category) =>
        set({
          transactions: get().transactions.map((t) =>
            t.id === id ? { ...t, category, categoryLocked: true } : t
          ),
        }),

      // A message's id stays in `processed`, so a later sync won't bring the transaction back.
      deleteTransaction: (id) => {
        const { transactions, accounts } = get();
        const txn = transactions.find((t) => t.id === id);
        set({
          transactions: transactions.filter((t) => t.id !== id),
          accounts: txn?.balanceApplied ? adjustBalances(accounts, txn, -1) : accounts,
        });
      },

      updateTransaction: (id, patch) => {
        const { transactions, accounts } = get();
        const before = transactions.find((t) => t.id === id);
        if (!before) return;
        const after: Transaction = {
          ...before,
          ...patch,
          categoryLocked: before.categoryLocked || patch.category !== undefined,
          // Only a change beyond the category needs protecting from re-analysis.
          userEdited:
            before.userEdited || Object.keys(patch).some((k) => k !== 'category'),
        };
        let nextAccounts = accounts;
        if (before.balanceApplied) {
          nextAccounts = adjustBalances(adjustBalances(nextAccounts, before, -1), after, 1);
        }
        set({
          transactions: transactions.map((t) => (t.id === id ? after : t)).sort(byDateDesc),
          accounts: nextAccounts,
        });
      },

      restoreData: (snapshot) =>
        set({
          transactions: snapshot.transactions,
          accounts: snapshot.accounts,
          settings: snapshot.settings,
          ...(snapshot.processed ? { processed: snapshot.processed } : null),
          accountsChanged: true,
        }),

      addManualTransaction: (entry) => {
        const { transactions, accounts } = get();
        const isTransfer = entry.kind === 'transfer';
        const account = accounts.find((a) => a.id === entry.accountId) ?? null;
        const applies = entry.updateBalance && (!!account || (isTransfer && !!entry.toAccountId));
        const txn: Transaction = {
          id: newId('manual'),
          source: 'manual',
          type: entry.kind === 'income' ? 'credit' : 'debit',
          amount: Math.abs(entry.amount),
          currency: entry.currency,
          merchant: entry.description.trim() || (isTransfer ? 'Transfer' : entry.category),
          category: isTransfer ? 'Transfers' : entry.category,
          account: account?.name ?? null,
          date: entry.date,
          balanceAfter: null,
          note: entry.note?.trim() || null,
          sender: '',
          rawText: '',
          parsedBy: 'manual',
          categoryLocked: true,
          accountId: entry.accountId,
          toAccountId: isTransfer ? entry.toAccountId : null,
          balanceApplied: applies,
        };
        set({
          transactions: [txn, ...transactions].sort(byDateDesc),
          accounts: applies ? adjustBalances(accounts, txn, 1) : accounts,
        });
      },

      addAccount: (input, chosenId) => {
        const id = chosenId ?? newId('acc');
        const account: Account = { ...input, id, balanceUpdatedAt: Date.now(), balanceSource: 'manual' };
        set({ ...relink(get().transactions, [...get().accounts, account]), accountsChanged: true });
        return id;
      },

      updateAccount: (id, input) => {
        const accounts = get().accounts.map((a) => {
          if (a.id !== id) return a;
          const balanceEdited = a.balance !== input.balance;
          return {
            ...a,
            ...input,
            balanceUpdatedAt: balanceEdited ? Date.now() : a.balanceUpdatedAt,
            balanceSource: balanceEdited ? ('manual' as const) : a.balanceSource,
          };
        });
        const before = get().accounts.find((a) => a.id === id);
        // Only identity changes affect how the AI reads transfers; a balance edit does not.
        const cardDigits = (cards: BankCard[] | undefined) => (cards ?? []).map((c) => c.last4).join(',');
        const identityChanged =
          !!before &&
          (before.name !== input.name ||
            before.kind !== input.kind ||
            before.last4 !== input.last4 ||
            (input.cards !== undefined && cardDigits(before.cards) !== cardDigits(input.cards)));
        set({
          ...relink(get().transactions, accounts),
          accountsChanged: get().accountsChanged || identityChanged,
        });
      },

      deleteAccount: (id) => {
        const transactions = get().transactions.map((t) =>
          t.accountId === id || t.toAccountId === id
            ? {
                ...t,
                accountId: t.accountId === id ? null : t.accountId,
                toAccountId: t.toAccountId === id ? null : t.toAccountId,
                // Its balance is gone with the account, so there is nothing left to undo.
                balanceApplied: false,
              }
            : t
        );
        set({
          ...relink(
            transactions,
            get().accounts.filter((a) => a.id !== id)
          ),
          accountsChanged: true,
        });
      },

      setAccountsChanged: (accountsChanged) => set({ accountsChanged }),

      setLastSmsSyncAt: (ms) => set({ lastSmsSyncAt: ms }),

      setGmailAccount: (email) =>
        set({ gmailEmail: email, gmailNeedsReconnect: false, lastEmailSyncAt: email ? get().lastEmailSyncAt : null }),

      setLastEmailSyncAt: (ms) => set({ lastEmailSyncAt: ms }),

      setGmailNeedsReconnect: (gmailNeedsReconnect) => set({ gmailNeedsReconnect }),

      setBinance: (binanceConnected, binanceAccountId) =>
        set({
          binanceConnected,
          binanceAccountId,
          binanceNeedsReconnect: false,
          lastBinanceSyncAt: binanceConnected ? get().lastBinanceSyncAt : null,
        }),

      setLastBinanceSyncAt: (ms) => set({ lastBinanceSyncAt: ms }),

      setBinanceNeedsReconnect: (binanceNeedsReconnect) => set({ binanceNeedsReconnect }),

      setApiBalance: (accountId, balance, currency) =>
        set({
          accounts: get().accounts.map((a) =>
            a.id === accountId
              ? { ...a, balance, currency, balanceUpdatedAt: Date.now(), balanceSource: 'api' as const }
              : a
          ),
        }),

      setInsights: (insights) => set({ insights: { ...get().insights, [insights.month]: insights } }),

      appendChat: (message) => set({ chat: [...get().chat, message] }),

      updateChatMessage: (id, patch) =>
        set({ chat: get().chat.map((m) => (m.id === id ? { ...m, ...patch } : m)) }),

      clearChat: () => set({ chat: [] }),

      addCalcEntry: (entry) => set({ calcHistory: [entry, ...get().calcHistory].slice(0, MAX_CALC_HISTORY) }),

      clearCalcHistory: () => set({ calcHistory: [] }),

      setWeeklySummary: (weeklySummary) => set({ weeklySummary }),

      setCloudBackup: (patch) => set({ cloudBackup: { ...get().cloudBackup, ...patch } }),

      updateSettings: (patch) => set({ settings: { ...get().settings, ...patch } }),

      resetSyncState: () => set({ lastSmsSyncAt: null }),

      // The Gmail connection is a setting, not data: it stays, and the next sync re-reads the window.
      clearAllData: () =>
        set({
          ...initialState(),
          settings: get().settings,
          gmailEmail: get().gmailEmail,
          // The key stays saved; its account was cleared with the rest, so the next connect makes a new one.
          binanceConnected: get().binanceConnected,
          // The pairing with the website stays; auto-backup skips an empty phone, so the
          // website's copy is not overwritten with nothing.
          cloudBackup: get().cloudBackup,
        }),
    }),
    {
      name: 'expense-ai-store',
      version: 2,
      storage: createJSONStorage(() => persistStorage),
      migrate: (persisted, version) => {
        const saved = (persisted ?? {}) as Partial<State>;
        if (version < 2 && saved.settings) {
          // v2: totals are shown in USD, with other currencies converted at a fixed, editable rate.
          // Insights written against the old totals no longer match, so they are dropped.
          saved.settings = { ...saved.settings, currency: DEFAULT_CURRENCY, rates: { ...DEFAULT_RATES } };
          saved.insights = {};
        }
        return saved as State;
      },
      // Data saved by an older build may lack newer fields; fill those from the defaults.
      merge: (persisted, current) => {
        const saved = (persisted ?? {}) as Partial<State>;
        return { ...current, ...saved, settings: { ...current.settings, ...saved.settings } };
      },
      partialize: (s): State => ({
        transactions: s.transactions,
        accounts: s.accounts,
        accountsChanged: s.accountsChanged,
        processed: s.processed,
        lastSmsSyncAt: s.lastSmsSyncAt,
        gmailEmail: s.gmailEmail,
        lastEmailSyncAt: s.lastEmailSyncAt,
        gmailNeedsReconnect: s.gmailNeedsReconnect,
        binanceConnected: s.binanceConnected,
        binanceAccountId: s.binanceAccountId,
        lastBinanceSyncAt: s.lastBinanceSyncAt,
        binanceNeedsReconnect: s.binanceNeedsReconnect,
        insights: s.insights,
        chat: s.chat,
        calcHistory: s.calcHistory,
        weeklySummary: s.weeklySummary,
        cloudBackup: s.cloudBackup,
        settings: s.settings,
      }),
    }
  )
);
