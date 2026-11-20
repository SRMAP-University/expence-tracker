export const CATEGORIES = [
  'Food & Dining',
  'Groceries',
  'Shopping',
  'Transport',
  'Fuel',
  'Bills & Utilities',
  'Rent & Housing',
  'Entertainment',
  'Subscriptions',
  'Health',
  'Education',
  'Travel',
  'Investments',
  'EMI & Loans',
  'Fees & Charges',
  'Transfers',
  'Salary & Income',
  'Refunds & Cashback',
  'Other',
] as const;

export type Category = (typeof CATEGORIES)[number];

/** Categories that move money between your own pockets; excluded from spend/income totals. */
export const NEUTRAL_CATEGORIES: readonly Category[] = ['Transfers'];

export type TxnType = 'debit' | 'credit';

/**
 * Where a transaction came from. `notification` is an alert captured from another app
 * (Stripe, a bank app); `email` is a message read from Gmail; `binance` is a record from the Binance
 * API; `manual` entries are typed in by hand.
 */
export type MessageSource = 'sms' | 'notification' | 'email' | 'binance' | 'paste' | 'demo' | 'manual';

export const ACCOUNT_KINDS = ['bank', 'card', 'wallet', 'payments', 'crypto', 'investment', 'cash'] as const;
export type AccountKind = (typeof ACCOUNT_KINDS)[number];

export const ACCOUNT_KIND_LABEL: Record<AccountKind, string> = {
  bank: 'Bank account',
  card: 'Credit card',
  wallet: 'Wallet',
  payments: 'Payment platform',
  crypto: 'Crypto platform',
  investment: 'Investments',
  cash: 'Cash',
};

/** One place the user keeps money: a bank account, wallet, crypto platform, and so on. */
export type Account = {
  id: string;
  name: string;
  kind: AccountKind;
  /** Last digits shown in bank alerts ("a/c ••1234"); links message transactions to this account. */
  last4: string | null;
  /** Money held. For a credit card, the amount owed. */
  balance: number;
  currency: string;
  /** Epoch ms the balance was last set, by hand or from a bank message. */
  balanceUpdatedAt: number;
  /** Who set the balance: you, a bank message, or an exchange's API (Binance). */
  balanceSource: 'manual' | 'sms' | 'api';
  /** Name on the account, as the bank has it. Bank accounts only. Never sent to the AI. */
  holderName?: string | null;
  /** The bank's cards. Only the last 4 digits and expiry are kept: never the full number, CVV or PIN. */
  cards?: BankCard[];
  /** A login ID and password are saved for it in the phone's secure storage (see bank-login.ts). */
  hasLogin?: boolean;
};

export type BankCard = {
  id: string;
  /** What the user calls it, e.g. "Millennia". */
  label: string;
  type: 'credit' | 'debit';
  last4: string;
  /** MM/YY, or null when not given. */
  expiry: string | null;
};

/** A message pulled from the inbox or pasted in, already redacted. */
export type InboundMessage = {
  id: string;
  source: MessageSource;
  sender: string;
  /** Redacted message text: long digit runs masked, never contains OTP messages. */
  text: string;
  /** Epoch ms the message was received (or imported, for pasted text). */
  receivedAt: number;
};

export type Transaction = {
  id: string;
  source: MessageSource;
  type: TxnType;
  amount: number;
  /** ISO 4217 code, e.g. INR, USD. */
  currency: string;
  merchant: string;
  category: Category;
  /** e.g. "HDFC ••1234". */
  account: string | null;
  /** ISO 8601 timestamp. */
  date: string;
  balanceAfter: number | null;
  note: string | null;
  sender: string;
  rawText: string;
  parsedBy: 'ai' | 'local' | 'manual';
  /** Set once the user picks a category by hand, so re-analysis never overwrites it. */
  categoryLocked?: boolean;
  /** Portfolio account this belongs to, when one matches. */
  accountId?: string | null;
  /** The account the AI filed this under, and for a transfer the one on the other side. */
  aiAccountId?: string | null;
  aiToAccountId?: string | null;
  /** For a transfer: the user's account on the other side (where it went, or for a credit, came from). */
  toAccountId?: string | null;
  /** A manual entry that adjusted its account balance when saved (undone if it is deleted). */
  balanceApplied?: boolean;
  /** Changed by the user (through the assistant): re-analysis and account matching leave it as it is. */
  userEdited?: boolean;
  /** Display only, never stored: the amount as it happened, when shown converted. */
  original?: { amount: number; currency: string };
};

export type Insight = {
  title: string;
  detail: string;
  tone: 'positive' | 'neutral' | 'warning';
};

export type MonthInsights = {
  month: string;
  generatedAt: number;
  headline: string;
  insights: Insight[];
};

export type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: number;
  error?: boolean;
  /** What the assistant changed while answering, one line each, e.g. "Deleted 3 transactions". */
  actions?: string[];
  /** Those changes were undone. */
  undone?: boolean;
};

/** The AI's look back at one week (Monday to Sunday). */
export type WeeklySummary = {
  /** Monday of that week, YYYY-MM-DD. */
  weekStart: string;
  weekEnd: string;
  headline: string;
  points: string[];
  spent: number;
  usualWeeklySpend: number;
  currency: string;
  createdAt: number;
  /** Hidden from Home by the user. */
  dismissed?: boolean;
};

/** One calculation from the calculator, kept so it can be looked back on. */
export type CalcEntry = {
  id: string;
  /** As typed, e.g. "1200×12+45". */
  expression: string;
  /** The answer as shown, e.g. "14,445". */
  result: string;
  /** Epoch ms. */
  at: number;
};

export type Settings = {
  /** Optional first name: used for the greeting, and to help the AI spot transfers to yourself. */
  name: string;
  model: string;
  /** Currency totals and charts are shown in. */
  currency: string;
  /** Units of each other currency per 1 US dollar, e.g. { INR: 100 }. */
  rates: Record<string, number>;
  lookbackDays: number;
  /** Today's spending as an Android Live Update (status bar chip / OnePlus Live Alerts). Off unless turned on. */
  liveSpending?: boolean;
  /** Ask for the fingerprint when the app opens. */
  appLock?: boolean;
  /** Notify the day before a bill is due. */
  billReminders?: boolean;
  /** Notify on Monday morning that last week's summary is ready. */
  weeklySummaryReminder?: boolean;
};
