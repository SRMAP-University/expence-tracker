import { deleteSecret, getSecret, setSecret } from './secret-store';
import { hmacSha256Hex } from './sha256';
import type { InboundMessage } from './types';

/**
 * Read-only access to the user's Binance account: the activity history (deposits, withdrawals,
 * fiat orders, Binance Pay) and the total balance. Calls go straight from the phone to Binance;
 * the key and secret live in the phone's secure storage and are never sent anywhere else.
 */

const BASE = 'https://api.binance.com';
const REQUEST_TIMEOUT_MS = 30_000;
const RECV_WINDOW_MS = 10_000;
/** Binance caps deposit, withdrawal and Pay history at 90 days per request. */
const WINDOW_MS = 89 * 86_400_000;

const KEY_NAME = 'binance_api_key';
const SECRET_NAME = 'binance_api_secret';

export type BinanceCredentials = { apiKey: string; secret: string };

export class BinanceError extends Error {
  constructor(
    message: string,
    /** The key or secret is wrong or was deleted; reconnecting with a new key fixes it. */
    readonly badCredentials = false
  ) {
    super(message);
    this.name = 'BinanceError';
  }
}

export async function getBinanceCredentials(): Promise<BinanceCredentials | null> {
  const [apiKey, secret] = await Promise.all([getSecret(KEY_NAME), getSecret(SECRET_NAME)]);
  return apiKey && secret ? { apiKey, secret } : null;
}

export async function saveBinanceCredentials(creds: BinanceCredentials) {
  await setSecret(KEY_NAME, creds.apiKey);
  await setSecret(SECRET_NAME, creds.secret);
}

export async function deleteBinanceCredentials() {
  await Promise.all([deleteSecret(KEY_NAME).catch(() => {}), deleteSecret(SECRET_NAME).catch(() => {})]);
}

// ---------------------------------------------------------------------------
// Requests
// ---------------------------------------------------------------------------

let clockOffset = 0;
let clockCheckedAt = 0;

/** Binance rejects signed requests whose timestamp is off by more than the receive window. */
async function serverTime() {
  if (Date.now() - clockCheckedAt > 10 * 60_000) {
    try {
      const { serverTime: remote } = await request<{ serverTime: number }>('/api/v3/time', {});
      clockOffset = remote - Date.now();
      clockCheckedAt = Date.now();
    } catch {
      // Fall back to the phone's clock; a request that fails on time says so clearly.
    }
  }
  return Date.now() + clockOffset;
}

type Params = Record<string, string | number | undefined>;

function describeError(status: number, code: number | undefined, msg: string): BinanceError {
  if (code === -2014 || code === -2015 || code === -2008) {
    return new BinanceError('Binance rejected the API key. It may be mistyped, deleted, or limited to other IP addresses.', true);
  }
  if (code === -1022) return new BinanceError('Binance rejected the secret key: it does not match this API key.', true);
  if (code === -1021) return new BinanceError('This phone’s clock is out of sync with Binance. Set the time to automatic and try again.');
  if (status === 451 || status === 403) {
    return new BinanceError('Binance refused the request from this network or location.');
  }
  if (status === 418 || status === 429) return new BinanceError('Binance is rate-limiting requests. Try again in a few minutes.');
  return new BinanceError(`Binance error${code ? ` ${code}` : ''}: ${msg || `HTTP ${status}`}`);
}

async function request<T>(path: string, params: Params, creds?: BinanceCredentials): Promise<T> {
  const entries = Object.entries(params).filter(([, v]) => v !== undefined) as [string, string | number][];
  if (creds) entries.push(['recvWindow', RECV_WINDOW_MS], ['timestamp', await serverTime()]);
  let query = entries.map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`).join('&');
  if (creds) query += `&signature=${hmacSha256Hex(creds.secret, query)}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}${query ? `?${query}` : ''}`, {
      headers: creds ? { 'X-MBX-APIKEY': creds.apiKey } : {},
      signal: controller.signal,
    });
  } catch {
    throw new BinanceError(controller.signal.aborted ? 'Binance took too long to respond.' : 'Could not reach Binance.');
  } finally {
    clearTimeout(timer);
  }

  const body = (await res.json().catch(() => null)) as
    | (T & { code?: number | string; msg?: string; message?: string; success?: boolean })
    | null;
  if (!res.ok) {
    const code = typeof body?.code === 'number' ? body.code : Number(body?.code) || undefined;
    throw describeError(res.status, code, body?.msg ?? body?.message ?? '');
  }
  // Fiat and Pay endpoints wrap results as { code: "000000", success, data }.
  if (body && typeof body === 'object' && 'success' in body && body.success === false) {
    throw new BinanceError(`Binance: ${body.message ?? body.msg ?? 'request failed'}`);
  }
  return body as T;
}

// ---------------------------------------------------------------------------
// Key check and balance
// ---------------------------------------------------------------------------

type Restrictions = {
  enableReading: boolean;
  enableWithdrawals: boolean;
  enableInternalTransfer: boolean;
  enableMargin: boolean;
  enableFutures: boolean;
  permitsUniversalTransfer: boolean;
  enableVanillaOptions: boolean;
  enableSpotAndMarginTrading: boolean;
  enablePortfolioMarginTrading: boolean;
  enableFixApiTrade?: boolean;
};

/**
 * Confirms the key works and can only read. A key that can trade, transfer or withdraw is
 * refused: this app never needs that, and a stored key that can move money is a needless risk.
 */
export async function verifyReadOnlyKey(creds: BinanceCredentials) {
  const r = await request<Restrictions>('/sapi/v1/account/apiRestrictions', {}, creds);
  if (!r.enableReading) throw new BinanceError('This key cannot read your account. Tick Enable Reading for it in Binance.');
  const risky = [
    r.enableWithdrawals && 'withdrawals',
    (r.enableSpotAndMarginTrading || r.enableMargin || r.enableFutures || r.enableVanillaOptions ||
      r.enablePortfolioMarginTrading || r.enableFixApiTrade) && 'trading',
    (r.enableInternalTransfer || r.permitsUniversalTransfer) && 'transfers',
  ].filter(Boolean);
  if (risky.length) {
    throw new BinanceError(
      `This key allows ${risky.join(' and ')}. Delete it in Binance and create one with only Enable Reading ticked.`
    );
  }
}

/** Total of every Binance wallet, valued in USDT (treated as US dollars). */
export async function fetchTotalBalanceUsd(creds: BinanceCredentials): Promise<number> {
  const wallets = await request<{ activate: boolean; balance: string; walletName: string }[]>(
    '/sapi/v1/asset/wallet/balance',
    { quoteAsset: 'USDT' },
    creds
  );
  const total = wallets.reduce((sum, w) => sum + (Number(w.balance) || 0), 0);
  return Math.round(total * 100) / 100;
}

// ---------------------------------------------------------------------------
// Prices: so the AI and the totals see crypto amounts in US dollars
// ---------------------------------------------------------------------------

const DOLLAR_COINS = new Set(['USDT', 'USDC', 'FDUSD', 'BUSD', 'TUSD', 'USDP', 'DAI', 'USD']);
const FIAT = new Set(['INR', 'EUR', 'GBP', 'BRL', 'TRY', 'AUD', 'CAD', 'JPY', 'AED', 'SGD', 'NGN', 'ZAR', 'MXN', 'ARS']);

/** Daily closing price of `coin` in USDT on the day of `atMs`, or the current price as a fallback. */
async function priceUsd(coin: string, atMs: number, cache: Map<string, number | null>): Promise<number | null> {
  if (DOLLAR_COINS.has(coin)) return 1;
  if (FIAT.has(coin)) return null;
  const day = Math.floor(atMs / 86_400_000) * 86_400_000;
  const key = `${coin}:${day}`;
  if (cache.has(key)) return cache.get(key) ?? null;
  let price: number | null = null;
  try {
    const candles = await request<[number, string, string, string, string][]>('/api/v3/klines', {
      symbol: `${coin}USDT`,
      interval: '1d',
      startTime: day,
      limit: 1,
    });
    price = Number(candles[0]?.[4]) || null;
  } catch {
    try {
      const t = await request<{ price: string }>('/api/v3/ticker/price', { symbol: `${coin}USDT` });
      price = Number(t.price) || null;
    } catch {
      price = null;
    }
  }
  cache.set(key, price);
  return price;
}

function usdNote(amount: number, price: number | null) {
  return price === null ? '' : ` (≈ $${(amount * price).toFixed(2)})`;
}

/** "2026-11-12 08:15:00" in UTC, as Binance writes withdrawal times. */
function utcTime(text: string | undefined): number {
  if (!text) return Date.now();
  const ms = Date.parse(`${text.replace(' ', 'T')}Z`);
  return Number.isFinite(ms) ? ms : Date.now();
}

function windows(fromMs: number, toMs: number): [number, number][] {
  const out: [number, number][] = [];
  for (let start = fromMs; start < toMs; start += WINDOW_MS) out.push([start, Math.min(start + WINDOW_MS, toMs)]);
  return out;
}

// ---------------------------------------------------------------------------
// Activity
// ---------------------------------------------------------------------------

type Deposit = {
  id?: string;
  amount: string;
  coin: string;
  network?: string;
  status: number;
  txId?: string;
  insertTime: number;
  transferType?: number;
};
type Withdrawal = {
  id: string;
  amount: string;
  transactionFee?: string;
  coin: string;
  status: number;
  network?: string;
  applyTime: string;
  completeTime?: string;
  transferType?: number;
};
type FiatOrder = {
  orderNo: string;
  fiatCurrency: string;
  amount: string;
  totalFee?: string;
  method?: string;
  status: string;
  createTime: number;
};
type FiatPayment = {
  orderNo: string;
  sourceAmount: string;
  fiatCurrency: string;
  obtainAmount: string;
  cryptoCurrency: string;
  totalFee?: string;
  status: string;
  paymentMethod?: string;
  createTime: number;
};
type PayRecord = {
  orderType: string;
  transactionId: string;
  transactionTime: number;
  amount: string;
  currency: string;
  payerInfo?: { name?: string };
  receiverInfo?: { name?: string };
};

const message = (id: string, receivedAt: number, text: string): InboundMessage => ({
  id: `binance:${id}`,
  source: 'binance',
  sender: 'Binance',
  text,
  receivedAt,
});

/**
 * Binance activity between the two times, as plain-language records for the AI.
 *
 * Crypto deposits and withdrawals are the core: if either fails, the whole read fails. Fiat
 * orders and Binance Pay are not offered in every country, so a failure there is skipped quietly.
 */
export async function fetchBinanceActivity(
  creds: BinanceCredentials,
  sinceMs: number,
  untilMs: number
): Promise<InboundMessage[]> {
  const prices = new Map<string, number | null>();
  const out: InboundMessage[] = [];

  for (const [start, end] of windows(sinceMs, untilMs)) {
    const deposits = await request<Deposit[]>(
      '/sapi/v1/capital/deposit/hisrec',
      { startTime: start, endTime: end, limit: 1000 },
      creds
    );
    for (const d of deposits) {
      if (d.status !== 1 && d.status !== 6) continue; // only deposits that arrived
      const amount = Number(d.amount);
      const via = d.transferType === 1 ? 'an internal transfer from another Binance account' : `the ${d.network ?? d.coin} network`;
      out.push(
        message(
          `dep:${d.id ?? d.txId ?? `${d.coin}-${d.insertTime}`}`,
          d.insertTime,
          `Binance: crypto deposit of ${d.amount} ${d.coin}${usdNote(amount, await priceUsd(d.coin, d.insertTime, prices))} received into the user's Binance account via ${via}.`
        )
      );
    }

    const withdrawals = await request<Withdrawal[]>(
      '/sapi/v1/capital/withdraw/history',
      { startTime: start, endTime: end, limit: 1000 },
      creds
    );
    for (const w of withdrawals) {
      if (w.status !== 6) continue; // only completed withdrawals
      const at = utcTime(w.completeTime ?? w.applyTime);
      const amount = Number(w.amount);
      const via = w.transferType === 1 ? 'an internal transfer to another Binance account' : `the ${w.network ?? w.coin} network`;
      const fee = w.transactionFee && Number(w.transactionFee) > 0 ? `, fee ${w.transactionFee} ${w.coin}` : '';
      out.push(
        message(
          `wd:${w.id}`,
          at,
          `Binance: crypto withdrawal of ${w.amount} ${w.coin}${usdNote(amount, await priceUsd(w.coin, at, prices))} sent from the user's Binance account via ${via}${fee}.`
        )
      );
    }

    // Binance Pay: payments to merchants and people, and money received from them.
    try {
      const pay = await request<{ data?: PayRecord[] }>(
        '/sapi/v1/pay/transactions',
        { startTime: start, endTime: end, limit: 100 },
        creds
      );
      for (const p of pay.data ?? []) {
        const amount = Number(p.amount);
        const usd = usdNote(Math.abs(amount), await priceUsd(p.currency, p.transactionTime, prices));
        const text =
          amount < 0
            ? `Binance Pay (${p.orderType}): paid ${Math.abs(amount)} ${p.currency}${usd} to ${p.receiverInfo?.name || 'someone'} from the user's Binance account.`
            : `Binance Pay (${p.orderType}): received ${amount} ${p.currency}${usd} from ${p.payerInfo?.name || 'someone'} into the user's Binance account.`;
        out.push(message(`pay:${p.transactionId}`, p.transactionTime, text));
      }
    } catch (e) {
      if (e instanceof BinanceError && e.badCredentials) throw e;
    }
  }

  // Fiat: bank deposits and withdrawals, and crypto bought or sold with a card or bank.
  for (const transactionType of [0, 1]) {
    try {
      const orders = await request<{ data?: FiatOrder[] }>(
        '/sapi/v1/fiat/orders',
        { transactionType, beginTime: sinceMs, endTime: untilMs, rows: 500 },
        creds
      );
      for (const o of orders.data ?? []) {
        if (o.status !== 'Successful' && o.status !== 'Finished') continue;
        const method = o.method ? ` by ${o.method}` : '';
        out.push(
          message(
            `fiat:${o.orderNo}`,
            o.createTime,
            transactionType === 0
              ? `Binance: ${o.fiatCurrency} ${o.amount} deposited into the user's Binance account${method}.`
              : `Binance: ${o.fiatCurrency} ${o.amount} withdrawn from the user's Binance account to their bank${method}.`
          )
        );
      }
    } catch (e) {
      if (e instanceof BinanceError && e.badCredentials) throw e;
    }
    try {
      const payments = await request<{ data?: FiatPayment[] }>(
        '/sapi/v1/fiat/payments',
        { transactionType, beginTime: sinceMs, endTime: untilMs, rows: 500 },
        creds
      );
      for (const p of payments.data ?? []) {
        if (p.status !== 'Completed') continue;
        const method = p.paymentMethod ? ` paid by ${p.paymentMethod}` : '';
        out.push(
          message(
            `buy:${p.orderNo}`,
            p.createTime,
            transactionType === 0
              ? `Binance: bought ${p.obtainAmount} ${p.cryptoCurrency} for ${p.fiatCurrency} ${p.sourceAmount}${method}, credited to the user's Binance account.`
              : `Binance: sold ${p.cryptoCurrency} from the user's Binance account for ${p.fiatCurrency} (source amount ${p.sourceAmount}, received amount ${p.obtainAmount}).`
          )
        );
      }
    } catch (e) {
      if (e instanceof BinanceError && e.badCredentials) throw e;
    }
  }

  return out.sort((a, b) => b.receivedAt - a.receivedAt);
}
