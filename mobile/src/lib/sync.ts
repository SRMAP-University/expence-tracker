import { PermissionsAndroid, Platform } from 'react-native';

import { hasSmsPermission, isSmsReaderAvailable, readInbox } from '../../modules/sms-reader';
import {
  captureActiveNotifications,
  hasNotificationAccess,
  isNotificationReaderAvailable,
  readCapturedNotifications,
  reconnectNotificationListener,
  removeCapturedNotifications,
} from '../../modules/sms-reader/notifications';
import { hashString } from './format';
import { BinanceError, fetchBinanceActivity, fetchTotalBalanceUsd, getBinanceCredentials } from './binance';
import { alreadyRecorded } from './dedupe';
import { canUseGmail, fetchFinanceEmails, GmailError } from './gmail';
import { deviceCurrency } from './money';
import { extractTransactions, OpenAIError, type ExtractedTransaction } from './openai';
import { getApiKey } from './secret-store';
import { hasAmount, isCategory, isLikelyTransaction, isOtp, mayBeMoneyAlert, redactMessage } from './sms-parser';
import { useStore } from './store';
import type { Account, InboundMessage, MessageSource, Transaction } from './types';

const BATCH_SIZE = 20;
const DAY = 86_400_000;

export const canReadSms = Platform.OS === 'android' && isSmsReaderAvailable;
/** False in app builds made before notification reading existed, in Expo Go, and off Android. */
export const canReadNotifications = Platform.OS === 'android' && isNotificationReaderAvailable;

/** Whether this build can read anything by itself (SMS or notifications). Otherwise it is paste-only. */
export const canSync = canReadSms || canReadNotifications || canUseGmail;

export type Progress = { label: string; done: number; total: number };

export type AnalyzeResult = {
  analyzed: number;
  added: number;
  failedBatches: number;
  errors: string[];
};

/** Thrown when messages need reading but no OpenAI key is saved. The AI is the only reader. */
export class MissingKeyError extends Error {
  constructor() {
    super('Add your OpenAI key first. The AI reads each bank message and decides what it is.');
    this.name = 'MissingKeyError';
  }
}

/** The account with exactly this name, as the AI was asked to copy it from the list. */
function accountIdByName(name: string | null, accounts: Account[]) {
  const wanted = name?.trim().toLowerCase();
  if (!wanted) return null;
  return accounts.find((a) => a.name.trim().toLowerCase() === wanted)?.id ?? null;
}

export type SyncResult = AnalyzeResult & {
  scanned: number;
  candidates: number;
  /** A source that could not be read this time (e.g. Gmail access expired). The others still ran. */
  sourceErrors: string[];
};

const HOUR = 60 * 60 * 1000;

/** Money-related emails since the last email sync. A failure here never stops SMS and notifications. */
/**
 * New Binance activity since the last read, and the account's current total. The total is set
 * directly (it is a fact, not something to interpret); the activity goes to the AI like any alert.
 */
async function collectBinance(startedAt: number) {
  const { lastBinanceSyncAt, settings, processed, binanceAccountId } = useStore.getState();
  const none = { scanned: 0, messages: [] as InboundMessage[], error: null as string | null };
  const creds = await getBinanceCredentials().catch(() => null);
  if (!creds) return none;
  // A day of overlap, since Binance can record an item a little after it happened.
  const sinceMs = lastBinanceSyncAt ? lastBinanceSyncAt - DAY : startedAt - settings.lookbackDays * DAY;
  try {
    const records = await fetchBinanceActivity(creds, sinceMs, startedAt);
    if (binanceAccountId) {
      const total = await fetchTotalBalanceUsd(creds).catch(() => null);
      if (total !== null) useStore.getState().setApiBalance(binanceAccountId, total, 'USD');
    }
    useStore.getState().setBinanceNeedsReconnect(false);
    return { scanned: records.length, messages: records.filter((m) => !processed[m.id]), error: null };
  } catch (e) {
    if (e instanceof BinanceError && e.badCredentials) useStore.getState().setBinanceNeedsReconnect(true);
    return { ...none, error: `Binance: ${e instanceof Error ? e.message : String(e)}` };
  }
}

async function collectEmail(startedAt: number) {
  const { lastEmailSyncAt, settings, processed } = useStore.getState();
  // First run reads the same window as SMS; later runs overlap the previous one by an hour.
  const sinceMs = lastEmailSyncAt ? lastEmailSyncAt - HOUR : startedAt - settings.lookbackDays * DAY;
  try {
    const { listed, messages } = await fetchFinanceEmails({
      sinceMs,
      max: lastEmailSyncAt ? 200 : 300,
      skip: (id) => !!processed[id],
    });
    useStore.getState().setGmailNeedsReconnect(false);
    return {
      scanned: listed,
      messages: messages.filter((m) => !isOtp(m.text) && hasAmount(m.text)),
      error: null,
    };
  } catch (e) {
    if (e instanceof GmailError && e.needsReconnect) useStore.getState().setGmailNeedsReconnect(true);
    return { scanned: 0, messages: [] as InboundMessage[], error: `Gmail: ${e instanceof Error ? e.message : String(e)}` };
  }
}

/**
 * Which of the user's accounts a transaction belongs to. A Binance record always belongs to the
 * Binance account; the AI only decides the other side of a transfer (e.g. the bank it went to).
 */
function fileUnder(msg: InboundMessage, r: ExtractedTransaction, accounts: Account[]) {
  const own = msg.source === 'binance' ? useStore.getState().binanceAccountId : accountIdByName(r.ownAccount, accounts);
  const other = r.kind === 'transfer' ? accountIdByName(r.counterAccount, accounts) : null;
  return { aiAccountId: own, aiToAccountId: other !== own ? other : null };
}

function toTransaction(msg: InboundMessage, r: ExtractedTransaction, accounts: Account[]): Transaction | null {
  if (!r.isTransaction || !r.amount || r.amount <= 0 || (r.type !== 'debit' && r.type !== 'credit')) return null;
  // A message that names no currency is in the phone's own, not the display currency.
  const currency = deviceCurrency();
  // SMS receive time is the most reliable timestamp; pasted text only has what the message says.
  const statedDate = r.date ? new Date(`${r.date}T12:00:00`) : null;
  const date =
    msg.source === 'paste' && statedDate && !Number.isNaN(statedDate.getTime())
      ? statedDate
      : new Date(msg.receivedAt);

  return {
    id: msg.id,
    source: msg.source,
    type: r.type,
    amount: Math.abs(r.amount),
    currency: (r.currency || currency).toUpperCase().slice(0, 3),
    merchant: r.merchant?.trim() || 'Unknown',
    // A transfer between the user's own accounts is never spending or income, whatever category came back.
    category: r.kind === 'transfer' ? 'Transfers' : isCategory(r.category) ? r.category : 'Other',
    account: r.account,
    date: date.toISOString(),
    balanceAfter: r.balanceAfter,
    note: r.note,
    sender: msg.sender,
    rawText: msg.text,
    parsedBy: 'ai',
    ...fileUnder(msg, r, accounts),
  };
}

/**
 * Turns messages into transactions with OpenAI. There is no offline fallback: a guess that
 * cannot tell a transfer from spending does more harm than waiting for a key.
 * Each batch is saved as soon as it completes, so a failure part-way keeps earlier progress.
 */
export async function analyzeMessages(
  messages: InboundMessage[],
  onProgress?: (p: Progress) => void
): Promise<AnalyzeResult> {
  const store = useStore.getState();
  const { model, name: userName } = store.settings;
  const currency = deviceCurrency();
  const apiKey = await getApiKey().catch(() => null);
  const result: AnalyzeResult = { analyzed: 0, added: 0, failedBatches: 0, errors: [] };
  if (!messages.length) return result;
  if (!apiKey) throw new MissingKeyError();

  const batches: InboundMessage[][] = [];
  for (let i = 0; i < messages.length; i += BATCH_SIZE) batches.push(messages.slice(i, i + BATCH_SIZE));

  for (const [i, batch] of batches.entries()) {
    onProgress?.({ label: 'Analysing with AI', done: i * BATCH_SIZE, total: messages.length });
    try {
      const accounts = useStore.getState().accounts;
      const extracted = await extractTransactions(batch, { apiKey, model, currency, userName, accounts });
      const byId = new Map(extracted.map((r) => [r.id, r]));
      const txns: Transaction[] = [];
      const notTransactions: string[] = [];
      // Compare against what is already saved, minus this batch's own messages: on a re-run each
      // of them is still in the store, and must not be mistaken for a copy of itself or its twin.
      const batchIds = new Set(batch.map((m) => m.id));
      const saved = useStore.getState().transactions.filter((t) => !batchIds.has(t.id));
      for (const msg of batch) {
        const r = byId.get(msg.id);
        // A second alert about the same payment (bank + payment app) is dropped, not counted twice.
        const original = r?.duplicateOf && r.duplicateOf !== msg.id ? byId.get(r.duplicateOf) : undefined;
        const txn = r && !original?.isTransaction ? toTransaction(msg, r, accounts) : null;
        if (txn && !alreadyRecorded(txn, [...saved, ...txns])) txns.push(txn);
        else if (r) notTransactions.push(msg.id);
      }
      const s = useStore.getState();
      result.added += s.upsertTransactions(txns);
      // Re-analysis can conclude an earlier local guess wasn't a transaction at all.
      s.removeTransactions(notTransactions);
      // Only mark messages the model actually answered for, so skipped ones get retried.
      s.markProcessed(batch.filter((m) => byId.has(m.id)).map((m) => m.id));
      result.analyzed += byId.size;
    } catch (e) {
      result.failedBatches += 1;
      result.errors.push(e instanceof Error ? e.message : String(e));
      // A bad key or exhausted quota will fail every remaining batch too.
      if (e instanceof OpenAIError && (e.isAuthError || e.status === 429)) {
        result.failedBatches += batches.length - i - 1;
        break;
      }
    }
  }
  onProgress?.({ label: 'Done', done: messages.length, total: messages.length });
  return result;
}

/** Thrown when Android refuses READ_SMS, so the UI can offer a shortcut to the app's settings. */
export class SmsPermissionError extends Error {
  constructor() {
    super(
      "Android didn't give Expense AI access to SMS. In the app's settings, open Permissions > SMS and choose Allow. " +
        'If Android calls it a restricted setting, first tap ⋮ (top right) > Allow restricted settings.'
    );
    this.name = 'SmsPermissionError';
  }
}

export async function ensureSmsPermission() {
  if (!canReadSms) return false;
  const permission = PermissionsAndroid.PERMISSIONS.READ_SMS;
  if (await PermissionsAndroid.check(permission)) return true;
  const status = await PermissionsAndroid.request(permission, {
    title: 'Read bank SMS alerts',
    message:
      'Expense AI reads your SMS inbox to find bank and card alerts. OTPs are skipped, and only messages that look like transactions are analysed.',
    buttonPositive: 'Allow',
    buttonNegative: 'Not now',
  });
  return status === PermissionsAndroid.RESULTS.GRANTED;
}

/** New SMS alerts since the last sync that look like transactions. */
async function collectSms(startedAt: number) {
  const { lastSmsSyncAt, settings, processed } = useStore.getState();
  // Overlap the previous sync by an hour; `processed` de-duplicates.
  const sinceMs = lastSmsSyncAt ? lastSmsSyncAt - 60 * 60 * 1000 : startedAt - settings.lookbackDays * DAY;
  const inbox = await readInbox({ sinceMs, maxCount: 5000 });
  const messages: InboundMessage[] = inbox
    .filter((m) => !processed[`sms:${m.id}`] && isLikelyTransaction(m.body))
    .map((m) => ({
      id: `sms:${m.id}`,
      source: 'sms' as const,
      sender: m.address,
      text: redactMessage(m.body),
      receivedAt: m.date,
    }));
  return { scanned: inbox.length, messages };
}

/**
 * Notifications captured from the apps the user chose to watch. They come from finance apps
 * already, so anything that may be about money goes to the AI; it decides what is a transaction.
 */
async function collectNotifications() {
  // If Android left the listener unbound, ask for it back, and take what is showing right now
  // (an alert that arrived before its app was ticked, or while the listener was down).
  reconnectNotificationListener();
  await captureActiveNotifications().catch(() => 0);

  const { processed } = useStore.getState();
  const captured = await readCapturedNotifications(0, 500);
  const messages: InboundMessage[] = [];
  for (const n of captured) {
    const text = redactMessage([n.title, n.text].filter(Boolean).join('\n'));
    const id = `notif:${hashString(n.id)}`;
    if (processed[id] || isOtp(text) || !mayBeMoneyAlert(text)) continue;
    messages.push({ id, source: 'notification', sender: n.appName, text, receivedAt: n.postedAt });
  }
  const newest = captured.reduce((max, n) => Math.max(max, n.postedAt), 0);
  return { scanned: captured.length, messages, newest };
}

/**
 * Reads every source the app is allowed to (SMS inbox, captured notifications) and has the AI
 * turn what is new into transactions. Sources are analysed together, newest first, so two
 * alerts about one payment land side by side and are counted once.
 *
 * `interactive` is a tap on Sync: it may ask for SMS permission and reports what is missing.
 * A background sync (on opening the app) only uses what is already allowed and never prompts.
 */
export async function syncMessages(
  onProgress?: (p: Progress) => void,
  opts: { interactive: boolean } = { interactive: true }
): Promise<SyncResult> {
  const smsAllowed =
    canReadSms && (opts.interactive ? await ensureSmsPermission() : hasSmsPermission());
  const notificationsAllowed = canReadNotifications && hasNotificationAccess();
  const emailAllowed = canUseGmail && !!useStore.getState().gmailEmail;
  const binanceAllowed = useStore.getState().binanceConnected;

  if (!smsAllowed && !notificationsAllowed && !emailAllowed && !binanceAllowed) {
    if (!opts.interactive) {
      return { analyzed: 0, added: 0, failedBatches: 0, errors: [], scanned: 0, candidates: 0, sourceErrors: [] };
    }
    if (canReadSms) throw new SmsPermissionError();
    throw new Error(
      Platform.OS === 'android'
        ? 'Reading messages needs the installed app build. It is not available in Expo Go.'
        : 'iOS does not let apps read SMS or other apps\u2019 notifications. Paste your bank messages instead.'
    );
  }

  const startedAt = Date.now();
  onProgress?.({ label: 'Reading messages', done: 0, total: 0 });
  const sms = smsAllowed ? await collectSms(startedAt) : { scanned: 0, messages: [] };
  const notifications = notificationsAllowed
    ? await collectNotifications()
    : { scanned: 0, messages: [], newest: 0 };
  if (emailAllowed) onProgress?.({ label: 'Reading Gmail', done: 0, total: 0 });
  const email = emailAllowed ? await collectEmail(startedAt) : { scanned: 0, messages: [], error: null };
  if (binanceAllowed) onProgress?.({ label: 'Reading Binance', done: 0, total: 0 });
  const binance = binanceAllowed ? await collectBinance(startedAt) : { scanned: 0, messages: [], error: null };

  const candidates = [...sms.messages, ...notifications.messages, ...email.messages, ...binance.messages].sort(
    (a, b) => b.receivedAt - a.receivedAt
  );
  const result = await analyzeMessages(candidates, onProgress);

  if (result.failedBatches === 0) {
    if (smsAllowed) useStore.getState().setLastSmsSyncAt(startedAt);
    if (emailAllowed && !email.error) useStore.getState().setLastEmailSyncAt(startedAt);
    if (binanceAllowed && !binance.error) useStore.getState().setLastBinanceSyncAt(startedAt);
    // Drop from the phone's capture file only what is finished. A notification the AI did not
    // answer for stays (with everything after it), so the next sync tries it again.
    const { processed } = useStore.getState();
    const unfinished = notifications.messages.filter((m) => !processed[m.id]);
    const upTo = unfinished.length
      ? Math.min(...unfinished.map((m) => m.receivedAt)) - 1
      : notifications.newest;
    if (upTo > 0) await removeCapturedNotifications(upTo).catch(() => {});
  }
  return {
    ...result,
    scanned: sms.scanned + notifications.scanned + email.scanned + binance.scanned,
    candidates: candidates.length,
    sourceErrors: [email.error, binance.error].filter((e): e is string => !!e),
  };
}

/** Splits pasted text into individual messages: blank-line separated, or one per line. */
export function splitPastedText(text: string) {
  const blocks = text
    .split(/\n\s*\n/)
    .map((b) => b.trim())
    .filter(Boolean);
  if (blocks.length === 1) {
    const lines = blocks[0]
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);
    if (lines.length > 1 && lines.filter(hasAmount).length > 1) return lines;
  }
  return blocks;
}

export async function importPastedText(text: string, onProgress?: (p: Progress) => void) {
  const now = Date.now();
  const processed = useStore.getState().processed;
  const parts = splitPastedText(text);
  const skippedOtp = parts.filter(isOtp).length;
  const messages: InboundMessage[] = parts
    .filter((p) => !isOtp(p) && hasAmount(p))
    .map((p, i) => {
      const redacted = redactMessage(p);
      return {
        id: `paste:${hashString(redacted)}`,
        source: 'paste' as MessageSource,
        sender: 'Pasted',
        text: redacted,
        receivedAt: now - i, // keep paste order stable
      };
    });
  const fresh = messages.filter((m) => !processed[m.id]);
  const result = await analyzeMessages(fresh, onProgress);
  return {
    ...result,
    total: parts.length,
    duplicates: messages.length - fresh.length,
    skipped: parts.length - messages.length,
    skippedOtp,
  };
}

/** Transactions that came from a real message and can be sent through the AI again. */
export function reanalyzable(txns: Transaction[]) {
  return txns.filter(
    (t) =>
      t.source === 'sms' ||
      t.source === 'notification' ||
      t.source === 'email' ||
      t.source === 'binance' ||
      t.source === 'paste'
  );
}

/**
 * Sends every message-derived transaction back through the AI: after adding a key, or after
 * changing the accounts list so transfers between them are recognised. Manual entries are untouched.
 */
export async function reanalyzeMessages(onProgress?: (p: Progress) => void) {
  const accountsBefore = accountsSignature(useStore.getState().accounts);
  const messages: InboundMessage[] = reanalyzable(useStore.getState().transactions).map((t) => ({
    id: t.id,
    source: t.source,
    sender: t.sender,
    text: t.rawText,
    receivedAt: Date.parse(t.date),
  }));
  const result = await analyzeMessages(messages, onProgress);
  // If an account was added or edited while this ran, the result is already stale: leave the flag set.
  const unchanged = accountsSignature(useStore.getState().accounts) === accountsBefore;
  if (result.failedBatches === 0 && unchanged) useStore.getState().setAccountsChanged(false);
  return result;
}

/** Everything about the accounts list that changes how the AI reads a message. */
export function accountsSignature(accounts: Account[]) {
  return accounts
    .map((a) => `${a.id}:${a.name}:${a.kind}:${a.last4 ?? ''}:${(a.cards ?? []).map((c) => c.last4).join(',')}`)
    .join('|');
}

/** At most this many messages are analysed in one history import, to bound time and AI cost. */
const MAX_HISTORY_MESSAGES = 400;

export type HistorySource = 'sms' | 'binance' | 'gmail';

export type HistoryImport = {
  /** Records found in the period that were not read before. */
  found: number;
  analyzed: number;
  added: number;
  /** True when the period held more than one import handles; running it again does the rest. */
  moreLeft: boolean;
  error: string | null;
};

/**
 * Reads one source for a chosen period, further back than the normal sync looks, and has the AI
 * turn what is new into transactions. Used by the assistant ("get my Binance history from 2024").
 * Records already read are skipped, so running it twice adds nothing twice.
 */
export async function importHistory(
  source: HistorySource,
  fromMs: number,
  toMs: number,
  onProgress?: (p: Progress) => void
): Promise<HistoryImport> {
  const { processed } = useStore.getState();
  let candidates: InboundMessage[] = [];

  if (source === 'sms') {
    if (!canReadSms) throw new Error('This app build cannot read SMS.');
    if (!hasSmsPermission()) throw new Error('SMS access is not allowed. Tap Sync on Home to allow it.');
    const inbox = await readInbox({ sinceMs: fromMs, maxCount: 20_000 });
    candidates = inbox
      .filter((m) => m.date <= toMs && !processed[`sms:${m.id}`] && isLikelyTransaction(m.body))
      .map((m) => ({ id: `sms:${m.id}`, source: 'sms' as const, sender: m.address, text: redactMessage(m.body), receivedAt: m.date }));
  } else if (source === 'binance') {
    const creds = await getBinanceCredentials().catch(() => null);
    if (!creds) throw new Error('Binance is not connected. Connect it in Settings > Binance.');
    const records = await fetchBinanceActivity(creds, fromMs, toMs);
    candidates = records.filter((m) => !processed[m.id]);
  } else {
    if (!canUseGmail || !useStore.getState().gmailEmail) throw new Error('Gmail is not connected. Connect it in Settings > Email.');
    const { messages } = await fetchFinanceEmails({ sinceMs: fromMs, max: 500, skip: (id) => !!processed[id] });
    candidates = messages.filter((m) => m.receivedAt <= toMs && !isOtp(m.text) && hasAmount(m.text));
  }

  // Newest first, like a normal sync, so a capped run covers the most recent part of the period.
  candidates.sort((a, b) => b.receivedAt - a.receivedAt);
  const batch = candidates.slice(0, MAX_HISTORY_MESSAGES);
  const result = await analyzeMessages(batch, onProgress);
  return {
    found: candidates.length,
    analyzed: result.analyzed,
    added: result.added,
    moreLeft: candidates.length > batch.length,
    error: result.errors[0] ?? null,
  };
}
