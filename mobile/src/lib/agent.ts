/**
 * The assistant's hands: the tools it may call to read and change the app's data, and the code
 * that carries them out on the store. Every change also returns a one-line summary for the chat.
 *
 * Deliberately absent: anything to do with bank logins, API keys or other secrets. The assistant
 * can neither read nor set them.
 */
import { countsTowardTotals } from './analytics';
import { fetchTotalBalanceUsd, getBinanceCredentials } from './binance';
import { findBills } from './bills';
import { formatMoney, monthKey } from './format';
import { buildLedger } from './money';
import { netWorthHistory } from './networth-history';
import { useStore, type TransactionPatch } from './store';
import { importHistory, syncMessages, type HistorySource } from './sync';
import {
  ACCOUNT_KINDS,
  ACCOUNT_KIND_LABEL,
  CATEGORIES,
  type AccountKind,
  type Category,
  type Transaction,
} from './types';

const MAX_FOUND = 100;

type JsonSchema = Record<string, unknown>;

const str = (description: string): JsonSchema => ({ type: 'string', description });
const nullable = (schema: JsonSchema): JsonSchema => ({
  ...schema,
  type: [schema.type as string, 'null'],
  ...(schema.enum ? { enum: [...(schema.enum as unknown[]), null] } : null),
});
const num = (description: string): JsonSchema => ({ type: 'number', description });
const categoryEnum: JsonSchema = { type: 'string', enum: [...CATEGORIES] };
const kindEnum: JsonSchema = { type: 'string', enum: [...ACCOUNT_KINDS] };

function objectSchema(properties: Record<string, JsonSchema>): JsonSchema {
  return { type: 'object', properties, required: Object.keys(properties), additionalProperties: false };
}

export type AgentTool = { type: 'function'; name: string; description: string; parameters: JsonSchema; strict: true };

function tool(name: string, description: string, properties: Record<string, JsonSchema>): AgentTool {
  return { type: 'function', name, description, parameters: objectSchema(properties), strict: true };
}

export const AGENT_TOOLS: AgentTool[] = [
  tool(
    'find_transactions',
    'Search transactions. Every filter is optional (null). Returns the newest first, with the ids needed to edit or delete them.',
    {
      text: nullable(str('Words to match in the merchant, note, account label or category.')),
      category: nullable(categoryEnum),
      account_id: nullable(str('Only transactions of this account (id from list_accounts).')),
      type: nullable({ type: 'string', enum: ['debit', 'credit'], description: 'debit = money out, credit = money in.' }),
      from_date: nullable(str('YYYY-MM-DD, inclusive.')),
      to_date: nullable(str('YYYY-MM-DD, inclusive.')),
      min_amount: nullable(num('In the transaction’s own currency.')),
      max_amount: nullable(num('In the transaction’s own currency.')),
      limit: { type: 'integer', description: `At most ${MAX_FOUND}.` },
    }
  ),
  tool('add_transaction', 'Record a transaction by hand. Updates the chosen account’s balance.', {
    kind: { type: 'string', enum: ['expense', 'income', 'transfer'] },
    amount: num('Positive amount.'),
    currency: str('ISO code, e.g. USD or INR.'),
    description: str('Merchant or what it was for.'),
    category: categoryEnum,
    date: nullable(str('YYYY-MM-DD or a full ISO time. Null for now.')),
    account_id: nullable(str('Account it left (or arrived in, for income).')),
    to_account_id: nullable(str('For a transfer: the account it went to.')),
    note: nullable(str('Optional note.')),
  }),
  tool(
    'update_transactions',
    'Apply the same changes to one or more transactions. Null leaves a field as it is; "none" clears account_id, to_account_id or note.',
    {
      ids: { type: 'array', items: { type: 'string' } },
      merchant: nullable(str('New merchant or description.')),
      amount: nullable(num('New positive amount.')),
      currency: nullable(str('New ISO currency code.')),
      category: nullable(categoryEnum),
      date: nullable(str('YYYY-MM-DD or a full ISO time.')),
      type: nullable({ type: 'string', enum: ['debit', 'credit'] }),
      account_id: nullable(str('Account id, or "none".')),
      to_account_id: nullable(str('Other account of a transfer, or "none".')),
      note: nullable(str('Note text, or "none".')),
    }
  ),
  tool('delete_transactions', 'Delete transactions by id. They will not come back on the next sync.', {
    ids: { type: 'array', items: { type: 'string' } },
  }),
  tool('list_accounts', 'List the user’s accounts with ids, balances and cards.', {}),
  tool('add_account', 'Add an account (bank, card, wallet, payment platform, crypto, investment or cash).', {
    name: str('e.g. "HDFC Savings".'),
    kind: kindEnum,
    last4: nullable(str('Last 4 digits shown in bank alerts.')),
    balance: num('Current balance (for a card, the amount owed).'),
    currency: str('ISO code.'),
  }),
  tool('update_account', 'Change an account. Null leaves a field as it is.', {
    id: str('Account id.'),
    name: nullable(str('New name.')),
    kind: nullable(kindEnum),
    last4: nullable(str('New last 4 digits, or "none".')),
    balance: nullable(num('New balance.')),
    currency: nullable(str('New ISO currency code.')),
  }),
  tool('delete_account', 'Remove an account. Its transactions stay but are no longer linked to it.', {
    id: str('Account id.'),
  }),
  tool('update_settings', 'Change app settings. Null leaves a setting as it is.', {
    display_currency: nullable(str('Currency everything is shown in, ISO code.')),
    user_name: nullable(str('The user’s first name.')),
    rate_currency: nullable(str('Currency whose rate to set, e.g. INR.')),
    rate_per_usd: nullable(num('Units of rate_currency per 1 USD, e.g. 100.')),
    bill_reminders: nullable({ type: 'boolean', description: 'Notify the day before bills are due.' }),
    weekly_summary_reminder: nullable({ type: 'boolean', description: 'Notify on Monday when the weekly summary is ready.' }),
    live_alerts: nullable({ type: 'boolean', description: 'Today\u2019s spending in the status bar pill (Live Alerts).' }),
  }),
  tool(
    'import_history',
    'Read one source for a period further back than the app has, and turn what is new into transactions (the AI sorts them like a normal sync). Use when the user asks about a period the data does not cover, or asks to fetch older history. Up to 400 records per call; if more_left is true, call again. Can take a minute.',
    {
      source: { type: 'string', enum: ['sms', 'binance', 'gmail'] },
      from_date: str('YYYY-MM-DD, inclusive.'),
      to_date: nullable(str('YYYY-MM-DD, inclusive. Null for today.')),
    }
  ),
  tool('sync_now', 'Check every connected source (SMS, app notifications, Gmail, Binance) for anything new, right now.', {}),
  tool(
    'spending_summary',
    'Exact totals for a period, grouped, in the display currency (transfers between the user\u2019s own accounts left out). Use this for any question about how much was spent or received.',
    {
      from_date: str('YYYY-MM-DD, inclusive.'),
      to_date: str('YYYY-MM-DD, inclusive.'),
      type: { type: 'string', enum: ['debit', 'credit'], description: 'debit = spending, credit = income.' },
      group_by: { type: 'string', enum: ['category', 'merchant', 'account', 'month', 'day'] },
    }
  ),
  tool('get_bills', 'Bills and subscriptions found from repeating payments, with when each is next due.', {}),
  tool('net_worth_history', 'Net worth at the end of each month (estimated from transactions).', {
    months: { type: 'integer', description: 'How many months back, 2 to 24.' },
  }),
  tool('binance_balance', 'The live total balance of the connected Binance account, in USD.', {}),
];

type Args = Record<string, unknown>;
export type ToolOutcome = { result: unknown; action?: string };

class ToolError extends Error {}

const asString = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);
const asNumber = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

function asCategory(v: unknown): Category | null {
  return typeof v === 'string' && (CATEGORIES as readonly string[]).includes(v) ? (v as Category) : null;
}

function asCurrency(v: unknown) {
  const code = asString(v)?.toUpperCase();
  if (code && !/^[A-Z]{3,5}$/.test(code)) throw new ToolError(`"${code}" is not a currency code.`);
  return code ?? null;
}

/** "2026-11-18" becomes noon that day local time, so it never slips to the day before. */
function asDate(v: unknown): string | null {
  const s = asString(v);
  if (!s) return null;
  const ms = /^\d{4}-\d{2}-\d{2}$/.test(s) ? Date.parse(`${s}T12:00:00`) : Date.parse(s);
  if (Number.isNaN(ms)) throw new ToolError(`"${s}" is not a date.`);
  return new Date(ms).toISOString();
}

function accountRef(v: unknown): string | null | undefined {
  const s = asString(v);
  if (!s) return undefined;
  if (s.toLowerCase() === 'none') return null;
  if (!useStore.getState().accounts.some((a) => a.id === s)) throw new ToolError(`No account has the id "${s}".`);
  return s;
}

function plural(n: number, word: string) {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

function describeTxn(t: Transaction) {
  return `${t.merchant} ${t.type === 'credit' ? '+' : '−'}${formatMoney(t.amount, t.currency)}`;
}

function findTransactions(args: Args) {
  const state = useStore.getState();
  const text = asString(args.text)?.toLowerCase();
  const category = asCategory(args.category);
  const accountId = asString(args.account_id);
  const type = args.type === 'debit' || args.type === 'credit' ? args.type : null;
  const from = asString(args.from_date);
  const to = asString(args.to_date);
  const min = asNumber(args.min_amount);
  const max = asNumber(args.max_amount);
  const limit = Math.min(MAX_FOUND, Math.max(1, Math.floor(asNumber(args.limit) ?? 30)));

  // Shown amounts in the display currency too, the same figures the screens use.
  const displayed = new Map(buildLedger(state).transactions.map((t) => [t.id, t]));
  const names = new Map(state.accounts.map((a) => [a.id, a.name]));
  const matches = state.transactions.filter((t) => {
    const day = t.date.slice(0, 10);
    return (
      (!text ||
        [t.merchant, t.note ?? '', t.account ?? '', t.category, names.get(t.accountId ?? '') ?? '']
          .join(' ')
          .toLowerCase()
          .includes(text)) &&
      (!category || t.category === category) &&
      (!accountId || t.accountId === accountId || t.toAccountId === accountId) &&
      (!type || t.type === type) &&
      (!from || day >= from) &&
      (!to || day <= to) &&
      (min === null || t.amount >= min) &&
      (max === null || t.amount <= max)
    );
  });
  return {
    total_matches: matches.length,
    transactions: matches.slice(0, limit).map((t) => {
      const shown = displayed.get(t.id);
      return {
        id: t.id,
        date: t.date,
        merchant: t.merchant,
        type: t.type,
        amount: t.amount,
        currency: t.currency,
        display_amount: shown && shown.currency !== t.currency ? `${shown.amount} ${shown.currency}` : undefined,
        category: t.category,
        account: names.get(t.accountId ?? '') ?? t.account,
        account_id: t.accountId ?? null,
        to_account_id: t.toAccountId ?? null,
        note: t.note,
        source: t.source,
      };
    }),
  };
}

function addTransaction(args: Args): ToolOutcome {
  const kind = args.kind === 'income' || args.kind === 'transfer' ? args.kind : 'expense';
  const amount = asNumber(args.amount);
  if (amount === null || amount <= 0) throw new ToolError('The amount must be a positive number.');
  const currency = asCurrency(args.currency) ?? useStore.getState().settings.currency;
  const accountId = accountRef(args.account_id) ?? null;
  const toAccountId = accountRef(args.to_account_id) ?? null;
  if (kind === 'transfer' && (!accountId || !toAccountId)) {
    throw new ToolError('A transfer needs both account_id and to_account_id.');
  }
  const description = asString(args.description) ?? '';
  useStore.getState().addManualTransaction({
    kind,
    amount,
    currency,
    description,
    category: kind === 'transfer' ? 'Transfers' : (asCategory(args.category) ?? 'Other'),
    date: asDate(args.date) ?? new Date().toISOString(),
    accountId,
    toAccountId: kind === 'transfer' ? toAccountId : null,
    note: asString(args.note),
    updateBalance: true,
  });
  const label = kind === 'income' ? 'income' : kind === 'transfer' ? 'transfer' : 'expense';
  return {
    result: { ok: true },
    action: `Added ${label}: ${description || 'untitled'} ${formatMoney(amount, currency)}`,
  };
}

function updateTransactions(args: Args): ToolOutcome {
  const ids = Array.isArray(args.ids) ? args.ids.filter((x): x is string => typeof x === 'string') : [];
  const state = useStore.getState();
  const found = ids.filter((id) => state.transactions.some((t) => t.id === id));
  if (!found.length) throw new ToolError('None of those transaction ids exist. Use find_transactions first.');

  const patch: TransactionPatch = {};
  const merchant = asString(args.merchant);
  if (merchant) patch.merchant = merchant;
  const amount = asNumber(args.amount);
  if (amount !== null) {
    if (amount <= 0) throw new ToolError('The amount must be a positive number.');
    patch.amount = amount;
  }
  const currency = asCurrency(args.currency);
  if (currency) patch.currency = currency;
  const category = asCategory(args.category);
  if (category) patch.category = category;
  const date = asDate(args.date);
  if (date) patch.date = date;
  if (args.type === 'debit' || args.type === 'credit') patch.type = args.type;
  const accountId = accountRef(args.account_id);
  if (accountId !== undefined) patch.accountId = accountId;
  const toAccountId = accountRef(args.to_account_id);
  if (toAccountId !== undefined) patch.toAccountId = toAccountId;
  const note = asString(args.note);
  if (note) patch.note = note.toLowerCase() === 'none' ? null : note;
  if (!Object.keys(patch).length) throw new ToolError('No changes were given.');

  for (const id of found) useStore.getState().updateTransaction(id, patch);
  const what = Object.keys(patch)
    .map((k) => (k === 'accountId' ? 'account' : k === 'toAccountId' ? 'other account' : k))
    .join(', ');
  const subject = found.length === 1 ? describeTxn(state.transactions.find((t) => t.id === found[0])!) : plural(found.length, 'transaction');
  return { result: { ok: true, updated: found.length }, action: `Changed ${what} of ${subject}` };
}

function deleteTransactions(args: Args): ToolOutcome {
  const ids = Array.isArray(args.ids) ? args.ids.filter((x): x is string => typeof x === 'string') : [];
  const state = useStore.getState();
  const found = state.transactions.filter((t) => ids.includes(t.id));
  if (!found.length) throw new ToolError('None of those transaction ids exist. Use find_transactions first.');
  // One at a time, so a manual entry's effect on its account balance is undone too.
  for (const t of found) useStore.getState().deleteTransaction(t.id);
  return {
    result: { ok: true, deleted: found.length },
    action: found.length === 1 ? `Deleted ${describeTxn(found[0])}` : `Deleted ${plural(found.length, 'transaction')}`,
  };
}

function listAccounts() {
  return useStore.getState().accounts.map((a) => ({
    id: a.id,
    name: a.name,
    kind: a.kind,
    last4: a.last4,
    balance: a.balance,
    currency: a.currency,
    cards: (a.cards ?? []).map((c) => ({ label: c.label, type: c.type, last4: c.last4 })),
  }));
}

function asKind(v: unknown): AccountKind | null {
  return typeof v === 'string' && (ACCOUNT_KINDS as readonly string[]).includes(v) ? (v as AccountKind) : null;
}

function asLast4(v: unknown): string | null | undefined {
  const s = asString(v);
  if (!s) return undefined;
  if (s.toLowerCase() === 'none') return null;
  const digits = s.replace(/\D/g, '').slice(-4);
  if (digits.length < 3) throw new ToolError('last4 needs 3 or 4 digits.');
  return digits;
}

function addAccount(args: Args): ToolOutcome {
  const name = asString(args.name);
  if (!name) throw new ToolError('The account needs a name.');
  const kind = asKind(args.kind) ?? 'bank';
  const balance = asNumber(args.balance) ?? 0;
  const currency = asCurrency(args.currency) ?? useStore.getState().settings.currency;
  const id = useStore.getState().addAccount({ name, kind, last4: asLast4(args.last4) ?? null, balance, currency });
  return {
    result: { ok: true, id },
    action: `Added account ${name} (${ACCOUNT_KIND_LABEL[kind].toLowerCase()}, ${formatMoney(balance, currency)})`,
  };
}

function updateAccount(args: Args): ToolOutcome {
  const id = asString(args.id);
  const account = useStore.getState().accounts.find((a) => a.id === id);
  if (!account) throw new ToolError(`No account has the id "${id}". Use list_accounts first.`);
  const last4 = asLast4(args.last4);
  const next = {
    name: asString(args.name) ?? account.name,
    kind: asKind(args.kind) ?? account.kind,
    last4: last4 === undefined ? account.last4 : last4,
    balance: asNumber(args.balance) ?? account.balance,
    currency: asCurrency(args.currency) ?? account.currency,
    holderName: account.holderName,
    cards: account.cards,
    hasLogin: account.hasLogin,
  };
  useStore.getState().updateAccount(account.id, next);
  const changed = (['name', 'kind', 'last4', 'balance', 'currency'] as const).filter((k) => next[k] !== account[k]);
  return {
    result: { ok: true },
    action: changed.length ? `Changed ${changed.join(', ')} of ${account.name}` : `No change to ${account.name}`,
  };
}

function deleteAccount(args: Args): ToolOutcome {
  const id = asString(args.id);
  const account = useStore.getState().accounts.find((a) => a.id === id);
  if (!account) throw new ToolError(`No account has the id "${id}". Use list_accounts first.`);
  if (account.hasLogin) {
    // Its saved login sits behind the fingerprint; removing it is left to the account screen.
    throw new ToolError(
      'This account has a saved bank login. Ask the user to remove it from the account screen, which also deletes the login.'
    );
  }
  useStore.getState().deleteAccount(account.id);
  return { result: { ok: true }, action: `Removed account ${account.name}` };
}

function updateSettings(args: Args): ToolOutcome {
  const { settings, updateSettings: update } = useStore.getState();
  const actions: string[] = [];
  const patch: Partial<typeof settings> = {};
  const display = asCurrency(args.display_currency);
  if (display && display !== settings.currency) {
    patch.currency = display;
    actions.push(`display currency ${display}`);
  }
  const name = asString(args.user_name);
  if (name && name !== settings.name) {
    patch.name = name;
    actions.push(`name ${name}`);
  }
  const rateCurrency = asCurrency(args.rate_currency);
  const rate = asNumber(args.rate_per_usd);
  if (rateCurrency && rate !== null) {
    if (rate <= 0) throw new ToolError('A rate must be positive.');
    patch.rates = { ...settings.rates, [rateCurrency]: rate };
    actions.push(`rate ${rate} ${rateCurrency} = 1 USD`);
  }
  const switches: [keyof typeof settings, unknown, string][] = [
    ['billReminders', args.bill_reminders, 'bill reminders'],
    ['weeklySummaryReminder', args.weekly_summary_reminder, 'weekly summary reminder'],
    ['liveSpending', args.live_alerts, 'Live Alerts'],
  ];
  for (const [key, value, label] of switches) {
    if (typeof value === 'boolean' && value !== !!settings[key]) {
      (patch as Record<string, unknown>)[key] = value;
      actions.push(`${label} ${value ? 'on' : 'off'}`);
    }
  }
  if (!actions.length) return { result: { ok: true, changed: false } };
  update(patch);
  return { result: { ok: true }, action: `Set ${actions.join(', ')}` };
}

function dayStart(s: string | null, fallback: number) {
  const date = asDate(s);
  return date ? Date.parse(date) - 12 * 3_600_000 : fallback;
}

async function importHistoryTool(args: Args): Promise<ToolOutcome> {
  const source = (['sms', 'binance', 'gmail'] as const).includes(args.source as HistorySource)
    ? (args.source as HistorySource)
    : null;
  if (!source) throw new ToolError('source must be sms, binance or gmail.');
  const from = dayStart(asString(args.from_date), NaN);
  if (!Number.isFinite(from)) throw new ToolError('from_date is required, as YYYY-MM-DD.');
  const to = args.to_date ? dayStart(asString(args.to_date), Date.now()) + 86_400_000 - 1 : Date.now();
  if (to <= from) throw new ToolError('to_date must be after from_date.');
  try {
    const r = await importHistory(source, from, to);
    const name = source === 'sms' ? 'SMS' : source === 'gmail' ? 'Gmail' : 'Binance';
    return {
      result: {
        found_new_records: r.found,
        analyzed: r.analyzed,
        transactions_added: r.added,
        more_left: r.moreLeft,
        error: r.error,
      },
      action: r.added ? `Imported ${plural(r.added, 'transaction')} from ${name}` : undefined,
    };
  } catch (e) {
    throw new ToolError(e instanceof Error ? e.message : String(e));
  }
}

async function syncNowTool(): Promise<ToolOutcome> {
  try {
    const r = await syncMessages(undefined, { interactive: false });
    return {
      result: { checked: r.scanned, analyzed: r.analyzed, transactions_added: r.added, problems: r.sourceErrors },
      action: r.added ? `Synced: ${plural(r.added, 'new transaction')}` : undefined,
    };
  } catch (e) {
    throw new ToolError(e instanceof Error ? e.message : String(e));
  }
}

function spendingSummary(args: Args) {
  const from = asString(args.from_date);
  const to = asString(args.to_date);
  if (!from || !to) throw new ToolError('from_date and to_date are required, as YYYY-MM-DD.');
  const type = args.type === 'credit' ? 'credit' : 'debit';
  const groupBy = String(args.group_by ?? 'category');
  const state = useStore.getState();
  const ledger = buildLedger(state);
  const names = new Map(state.accounts.map((a) => [a.id, a.name]));
  const groups = new Map<string, { total: number; count: number }>();
  let total = 0;
  let count = 0;
  for (const t of ledger.transactions) {
    const day = t.date.slice(0, 10);
    if (t.type !== type || t.currency !== ledger.currency || day < from || day > to || !countsTowardTotals(t)) continue;
    const key =
      groupBy === 'merchant'
        ? t.merchant
        : groupBy === 'account'
          ? (names.get(t.accountId ?? '') ?? t.account ?? 'No account')
          : groupBy === 'month'
            ? monthKey(t.date)
            : groupBy === 'day'
              ? day
              : t.category;
    const g = groups.get(key) ?? { total: 0, count: 0 };
    g.total += t.amount;
    g.count += 1;
    groups.set(key, g);
    total += t.amount;
    count += 1;
  }
  const round = (n: number) => Math.round(n * 100) / 100;
  const byTime = groupBy === 'month' || groupBy === 'day';
  return {
    currency: ledger.currency,
    total: round(total),
    transactions: count,
    groups: [...groups.entries()]
      .sort((a, b) => (byTime ? a[0].localeCompare(b[0]) : b[1].total - a[1].total))
      .slice(0, 40)
      .map(([key, g]) => ({ [groupBy]: key, total: round(g.total), count: g.count })),
  };
}

function billsTool() {
  const ledger = buildLedger(useStore.getState());
  return findBills(ledger.transactions, new Date()).map((b) => ({
    merchant: b.merchant,
    amount: b.amount,
    currency: b.currency,
    cadence: b.cadence,
    next_due: b.nextDate.slice(0, 10),
    status: b.status,
    monthly_cost: Math.round(b.monthly * 100) / 100,
  }));
}

function netWorthTool(args: Args) {
  const months = Math.min(24, Math.max(2, Math.floor(asNumber(args.months) ?? 12)));
  const ledger = buildLedger(useStore.getState());
  return {
    currency: ledger.currency,
    months: netWorthHistory(ledger, new Date(), months).map((p) => ({ month: p.month, net_worth: Math.round(p.value) })),
  };
}

async function binanceBalanceTool() {
  const creds = await getBinanceCredentials().catch(() => null);
  if (!creds) throw new ToolError('Binance is not connected.');
  try {
    return { total_usd: await fetchTotalBalanceUsd(creds) };
  } catch (e) {
    throw new ToolError(e instanceof Error ? e.message : String(e));
  }
}

const HANDLERS: Record<string, (args: Args) => ToolOutcome | Promise<ToolOutcome>> = {
  import_history: importHistoryTool,
  sync_now: syncNowTool,
  spending_summary: (a) => ({ result: spendingSummary(a) }),
  get_bills: () => ({ result: billsTool() }),
  net_worth_history: (a) => ({ result: netWorthTool(a) }),
  binance_balance: async () => ({ result: await binanceBalanceTool() }),
  find_transactions: (a) => ({ result: findTransactions(a) }),
  add_transaction: addTransaction,
  update_transactions: updateTransactions,
  delete_transactions: deleteTransactions,
  list_accounts: () => ({ result: listAccounts() }),
  add_account: addAccount,
  update_account: updateAccount,
  delete_account: deleteAccount,
  update_settings: updateSettings,
};

/** Runs one tool call. A mistake in the call comes back to the model as an error it can fix. */
export async function runAgentTool(name: string, rawArgs: string): Promise<ToolOutcome> {
  const handler = HANDLERS[name];
  if (!handler) return { result: { error: `Unknown tool "${name}".` } };
  let args: Args;
  try {
    args = JSON.parse(rawArgs || '{}') as Args;
  } catch {
    return { result: { error: 'The arguments were not valid JSON.' } };
  }
  try {
    return await handler(args);
  } catch (e) {
    if (e instanceof ToolError) return { result: { error: e.message } };
    throw e;
  }
}

/** What the assistant is told about its role and the app, on top of the finance summary. */
export function agentInstructions(opts: { currency: string; financeContext: string }) {
  const accounts = listAccounts()
    .map((a) => `- ${a.id}: ${a.name} (${a.kind}${a.last4 ? `, ends ${a.last4}` : ''}), ${a.balance} ${a.currency}`)
    .join('\n');
  return `You are the assistant inside the user's personal finance app, and its admin: you can read and change all of the app's data with your tools, and you do what the user asks.

How to work:
- To edit or delete, first find the exact transactions with find_transactions, then act on their ids. Never invent ids.
- For totals ("how much did I spend on X in March"), use spending_summary rather than adding up yourself.
- If the user asks about a period the data does not reach, or asks for older history, use import_history (sms, gmail or binance) for that period first, then answer. Say how many transactions were added.
- Use sync_now when asked to check for new transactions, and binance_balance, get_bills or net_worth_history when asked about those.
- Act straight away when the request is clear, including "all", "every" or a clear set ("all Uber rides this month").
- If it is unclear which items are meant (several plausible matches and the user did not say all), list them briefly and ask; do not guess. Ask before deleting more than 20 transactions unless the user said "all".
- Amounts are positive; "type" says the direction (debit = money out, credit = money in). Use YYYY-MM-DD dates.
- After changing anything, reply with one or two lines saying what you did. The app shows each change with an Undo button, so do not ask the user to confirm afterwards.
- You cannot see or change bank logins, passwords or API keys, and must not ask for them.
- For questions, answer from the data. Be concise: under 120 words unless asked for more. Plain text; "-" bullets are fine, no other markdown.
- Money in ${opts.currency} unless a transaction uses another currency. Give general budgeting guidance only: no specific securities, no tax or legal determinations.

Today is ${new Date().toISOString().slice(0, 10)}. Categories: ${CATEGORIES.join(', ')}.

Accounts (id: name):
${accounts || '(none yet)'}

${opts.financeContext}`;
}
