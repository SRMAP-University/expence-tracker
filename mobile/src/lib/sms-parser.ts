import { CATEGORIES, type Category, type InboundMessage, type Transaction, type TxnType } from './types';

/**
 * Local, offline message handling:
 *  1. `isLikelyTransaction` decides which messages are worth analysing (and therefore which ever leave the device).
 *  2. `redactMessage` masks long digit runs (account / card / phone / reference numbers) before anything is stored or sent.
 *  3. `parseLocally` is a heuristic parser used when no OpenAI key is configured.
 */

// Alphabetic codes need a word boundary so "offers 500" isn't read as "Rs 500".
const CURRENCY_TOKEN = String.raw`(?:\b(?:rs\.?|inr|us\$|usd|eur|gbp|aed|sgd|cad|aud|jpy)|₹|\$|€|£|¥)`;
const NUMBER = String.raw`(\d[\d,]*(?:\.\d{1,2})?)`;

const AMOUNT_RE = new RegExp(
  String.raw`${CURRENCY_TOKEN}\s?${NUMBER}|${NUMBER}\s?(?:rs\.?|inr|usd|eur|gbp|aed|sgd|cad|aud)\b`,
  'i'
);
const OTP_RE =
  /\b(otp|one[\s-]?time[\s-]?(?:password|passcode|pin)|verification code|security code|login code|auth(?:entication)? code|passcode)\b/i;
const COMPLETED_RE =
  /\b(debited|credited|spent|paid|received|withdrawn|transferred|deposited|refunded|charged|purchased|sent)\b/i;
const HINT_RE =
  /\b(txn|transaction|purchase|debit|credit|upi|imps|neft|rtgs|pos|atm|a\/c|acct|account|card|wallet|refund|payment)\b/i;
const PROMO_RE =
  /\b(offer|win|won|congratulations|pre[\s-]?approved|eligible|apply now|limited time|voucher|coupon|upto|up to|discount|sale|hurry|click here)\b/i;
const NOT_FINAL_RE =
  /\b(is due|due on|due date|will be debited|requested|collect request|failed|declined|unsuccessful|minimum amount due)\b/i;

export function hasAmount(text: string) {
  return AMOUNT_RE.test(text);
}

const CRYPTO_RE = /\b(usdt|usdc|btc|eth|bnb|sol|xrp)\b/i;
const MONEY_WORD_RE = /\b(deposit(?:ed)?|withdraw(?:al|n)?|payment|transfer(?:red)?|salary|balance)\b/i;

/**
 * Looser test for alerts from apps the user chose to watch, which are finance apps already.
 * Many name an amount without a currency ("Paid 500 to Ramesh", "50 USDT deposited"), which
 * `hasAmount` alone would drop. The AI makes the final call.
 */
export function mayBeMoneyAlert(text: string) {
  if (hasAmount(text)) return true;
  return (
    /\d/.test(text) &&
    (COMPLETED_RE.test(text) || HINT_RE.test(text) || CRYPTO_RE.test(text) || MONEY_WORD_RE.test(text))
  );
}

export function isOtp(text: string) {
  return OTP_RE.test(text);
}

/** Cheap pre-filter. Errs on the side of inclusion; the AI makes the final call. */
export function isLikelyTransaction(text: string) {
  if (isOtp(text) || !hasAmount(text)) return false;
  const completed = COMPLETED_RE.test(text);
  if (!completed && !HINT_RE.test(text)) return false;
  if (!completed && (PROMO_RE.test(text) || NOT_FINAL_RE.test(text))) return false;
  return true;
}

const AMOUNT_CONTEXT_BEFORE = new RegExp(
  String.raw`(?:${CURRENCY_TOKEN}|bal(?:ance)?|amt|amount)[:\s.]*$`,
  'i'
);

/** Masks digit runs of 6+ (account, card, phone, UPI ref numbers), keeping the last 4. Amounts are left alone. */
export function redactMessage(text: string) {
  return text
    .replace(/\b\d{4}[\s-]\d{4}[\s-]\d{4}[\s-]\d{1,4}\b/g, (m) => `••${m.replace(/\D/g, '').slice(-4)}`)
    .replace(/\d{6,}/g, (match, offset: number, whole: string) => {
      const before = whole.slice(Math.max(0, offset - 10), offset);
      const after = whole.slice(offset + match.length, offset + match.length + 2);
      const looksLikeAmount = AMOUNT_CONTEXT_BEFORE.test(before) || /^\.\d/.test(after);
      return looksLikeAmount ? match : `••${match.slice(-4)}`;
    });
}

// ---------------------------------------------------------------------------
// Heuristic parser (no-AI fallback)
// ---------------------------------------------------------------------------

const SYMBOL_TO_CURRENCY: Record<string, string> = {
  rs: 'INR',
  'rs.': 'INR',
  inr: 'INR',
  '₹': 'INR',
  usd: 'USD',
  'us$': 'USD',
  eur: 'EUR',
  '€': 'EUR',
  gbp: 'GBP',
  '£': 'GBP',
  aed: 'AED',
  sgd: 'SGD',
  cad: 'CAD',
  aud: 'AUD',
  jpy: 'JPY',
  '¥': 'JPY',
};

const DOLLAR_CURRENCIES = new Set(['USD', 'CAD', 'AUD', 'SGD']);

function extractAmount(text: string, defaultCurrency: string) {
  const re = new RegExp(
    String.raw`(${CURRENCY_TOKEN})\s?${NUMBER}|${NUMBER}\s?(rs\.?|inr|usd|eur|gbp|aed|sgd|cad|aud)\b`,
    'i'
  );
  const m = re.exec(text);
  if (!m) return null;
  const symbol = (m[1] ?? m[4] ?? '').toLowerCase();
  const value = Number((m[2] ?? m[3] ?? '').replace(/,/g, ''));
  if (!Number.isFinite(value) || value <= 0) return null;
  let currency = SYMBOL_TO_CURRENCY[symbol];
  if (symbol === '$') currency = DOLLAR_CURRENCIES.has(defaultCurrency) ? defaultCurrency : 'USD';
  return { amount: value, currency: currency ?? defaultCurrency, index: m.index };
}

const DEBIT_RE = /\b(debited|spent|paid|withdrawn|sent|purchase[d]?|charged|debit)\b/i;
const CREDIT_RE = /\b(credited|received|deposited|refund(?:ed)?|cashback|reversed|reversal|credit(?!\s*card))\b/i;

function detectType(text: string): TxnType {
  const d = DEBIT_RE.exec(text);
  const c = CREDIT_RE.exec(text);
  if (d && c) return d.index <= c.index ? 'debit' : 'credit';
  return c ? 'credit' : 'debit';
}

function extractBalance(text: string) {
  const m = new RegExp(
    String.raw`(?:avl\.?|avbl\.?|available|net|clear)\s*bal(?:ance)?\.?[:\s]*(?:is\s*)?(?:${CURRENCY_TOKEN})?\s*${NUMBER}`,
    'i'
  ).exec(text);
  if (!m) return null;
  const value = Number(m[1].replace(/,/g, ''));
  return Number.isFinite(value) ? value : null;
}

const BANK_CODES: Record<string, string> = {
  HDFCBK: 'HDFC',
  HDFCBN: 'HDFC',
  ICICIB: 'ICICI',
  ICICIT: 'ICICI',
  SBIINB: 'SBI',
  SBIPSG: 'SBI',
  SBMSMS: 'SBI',
  CBSSBI: 'SBI',
  AXISBK: 'Axis',
  KOTAKB: 'Kotak',
  KOTAKM: 'Kotak',
  YESBNK: 'Yes Bank',
  IDFCFB: 'IDFC First',
  INDUSB: 'IndusInd',
  PNBSMS: 'PNB',
  BOIIND: 'Bank of India',
  CANBNK: 'Canara',
  UNIONB: 'Union Bank',
  AMEXIN: 'Amex',
  PAYTMB: 'Paytm',
  ONECRD: 'OneCard',
};

export function bankFromSender(sender: string) {
  const code = sender.toUpperCase().replace(/^[A-Z]{2}-/, '').replace(/-[A-Z]$/, '');
  if (BANK_CODES[code]) return BANK_CODES[code];
  if (/^[A-Z]{6}$/.test(code)) return code;
  return null;
}

function extractAccount(text: string, sender: string) {
  const m = /(?:a\/c|acct|account|card)[^\d\n]{0,24}?(\d{3,4})\b/i.exec(text);
  if (!m) return null;
  const bank = bankFromSender(sender);
  return `${bank ?? 'Acct'} ••${m[1]}`;
}

const STOP = String.raw`(?=\s+(?:on|via|using|for|ref|refno|txn|avl|avbl|with|from|to|upi|info|dated)\b|[.,;:(]|$)`;
const NAME = String.raw`([A-Za-z0-9&'.@_\- ]{2,40}?)`;
const MERCHANT_PATTERNS: Record<TxnType, RegExp[]> = {
  debit: [
    new RegExp(String.raw`\b(?:at|@)\s+${NAME}${STOP}`, 'i'),
    new RegExp(String.raw`\bto\s+(?:vpa\s+)?${NAME}${STOP}`, 'i'),
    // ICICI style: "debited for INR 500 on 12-Nov-26; SWIGGY credited."
    new RegExp(String.raw`;\s*${NAME}\s+credited\b`, 'i'),
    new RegExp(String.raw`\b(?:info|towards)[:\s]+${NAME}${STOP}`, 'i'),
    new RegExp(String.raw`\bfor\s+${NAME}${STOP}`, 'i'),
  ],
  credit: [
    new RegExp(String.raw`\bfrom\s+(?:vpa\s+)?${NAME}${STOP}`, 'i'),
    new RegExp(String.raw`\bby\s+(?:vpa\s+)?${NAME}${STOP}`, 'i'),
    new RegExp(String.raw`\b(?:info|towards)[:\s]+${NAME}${STOP}`, 'i'),
  ],
};

function titleCase(s: string) {
  return s.toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase());
}

const RAIL_PREFIX = /^(?:neft|imps|rtgs|upi|ach|nach|pos|ecom|salary|refund|trf|transfer)\b[\s/:-]*/i;
const LEGAL_SUFFIX = /\s+(?:com|in|india|pvt|private|ltd|limited|llp|inc)$/i;
const NOT_A_NAME =
  /^(?:your|ur|a\/c|acct|account|card|self|the|you|rs|inr|usd|eur|gbp|aed|sgd|cad|aud|bank|•+)\b|^[•\d\s.,]*$/i;

function cleanMerchant(raw: string) {
  let name = raw.trim();
  if (name.includes('@')) name = name.split('@')[0].replace(/[._-]?(upi|pay|payments?)$/i, '');
  name = name.replace(/[._]/g, ' ').replace(/\d{3,}/g, '').replace(/\s+/g, ' ').trim();
  while (RAIL_PREFIX.test(name)) name = name.replace(RAIL_PREFIX, '');
  while (LEGAL_SUFFIX.test(name)) name = name.replace(LEGAL_SUFFIX, '');
  // "to pay https://..." and similar are calls to action, not a counterparty.
  if (name.length < 2 || NOT_A_NAME.test(name) || /\b(?:https?|www|click|visit|link|login|download)\b/i.test(name)) {
    return null;
  }
  return titleCase(name).slice(0, 32);
}

function extractMerchant(text: string, type: TxnType) {
  for (const re of MERCHANT_PATTERNS[type]) {
    const m = re.exec(text);
    const name = m ? cleanMerchant(m[1]) : null;
    if (name) return name;
  }
  return null;
}

const CATEGORY_RULES: [Category, RegExp, TxnType?][] = [
  ['Refunds & Cashback', /\b(refund|cashback|reversal|reversed|reward)/i, 'credit'],
  ['Salary & Income', /\b(salary|payroll|sal cr|wages|stipend|dividend|interest (?:credited|paid)|bonus)\b/i, 'credit'],
  ['Transfers', /\b(credit ?card (?:bill )?payment|cc payment|card payment received|self[\s-]?transfer|to self|own account|wallet top[\s-]?up|add(?:ed)? money)\b/i],
  ['Subscriptions', /\b(netflix|spotify|prime video|amazon prime|hotstar|youtube|apple\.com|icloud|google ?one|disney|sonyliv|zee5|openai|chatgpt|github|notion|subscription|membership)\b/i],
  ['Investments', /\b(zerodha|groww|upstox|mutual fund|sip|nps|ppf|smallcase|kuvera|demat|etf|vanguard|robinhood|fidelity|schwab)\b/i],
  ['EMI & Loans', /\b(emi|loan|bajaj finserv|repayment|nach|ecs)\b/i],
  ['Travel', /\b(irctc|makemytrip|goibibo|cleartrip|indigo|air ?india|vistara|spicejet|akasa|airbnb|oyo|hotel|booking\.com|expedia|airlines?|flight|redbus)\b/i],
  ['Food & Dining', /\b(swiggy|zomato|restaurant|cafe|coffee|starbucks|domino'?s|pizza|mcdonald'?s|kfc|burger|eatsure|dining|bakery|uber ?eats|doordash|grubhub|chaayos)\b/i],
  ['Groceries', /\b(bigbasket|blinkit|zepto|instamart|dmart|grocery|grocer|supermarket|walmart|kroger|whole ?foods|jiomart|reliance fresh)\b/i],
  ['Fuel', /\b(petrol|fuel|diesel|hpcl|bpcl|iocl|indian ?oil|shell|bharat petroleum)\b/i],
  ['Transport', /\b(uber|ola|rapido|metro|lyft|taxi|cab|parking|fastag|toll)\b/i],
  ['Bills & Utilities', /\b(electricity|bescom|tata power|adani|water bill|gas bill|broadband|airtel|jio|vodafone|bsnl|recharge|postpaid|dth|bbps|utility|fibernet)\b/i],
  ['Rent & Housing', /\b(rent|nobroker|landlord|maintenance|society)\b/i],
  ['Entertainment', /\b(bookmyshow|pvr|inox|cinema|movie|steam|playstation|xbox|concert)\b/i],
  ['Health', /\b(pharmacy|apollo|medplus|1mg|pharmeasy|netmeds|hospital|clinic|doctor|diagnostic|medical|practo|gym|cult\.?fit)\b/i],
  ['Education', /\b(school|college|university|udemy|coursera|unacademy|tuition|course)\b/i],
  ['Shopping', /\b(amazon|flipkart|myntra|ajio|meesho|nykaa|shop|store|mall|ikea|target|decathlon|croma)\b/i],
  ['Fees & Charges', /\b(charges?|fee|penalty|gst on|annual fee|amc|surcharge)\b/i],
];

export function guessCategory(text: string, merchant: string | null, type: TxnType): Category {
  const haystack = `${merchant ?? ''} ${text}`;
  for (const [category, re, onlyFor] of CATEGORY_RULES) {
    if (onlyFor && onlyFor !== type) continue;
    if (re.test(haystack)) return category;
  }
  return type === 'credit' ? 'Salary & Income' : 'Other';
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

function normaliseYear(y: number) {
  return y < 100 ? 2000 + y : y;
}

/** Best-effort date read from the message body; used for pasted messages that have no receive time. */
export function extractDate(text: string): Date | null {
  // Midday local time, so the calendar day survives any timezone conversion.
  const at = (y: number, monthIndex: number, day: number) => new Date(y, monthIndex, day, 12);
  let d: Date | null = null;
  let m = /\b(\d{4})-(\d{2})-(\d{2})\b/.exec(text);
  if (m) d = at(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  if (!d) {
    m = /\b(\d{1,2})[-/ ]?(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*[-/ ,]*(\d{2,4})\b/i.exec(text);
    if (m) d = at(normaliseYear(Number(m[3])), MONTHS.indexOf(m[2].toLowerCase()), Number(m[1]));
  }
  if (!d) {
    m = /\b(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})\b/.exec(text);
    if (m) {
      let day = Number(m[1]);
      let month = Number(m[2]);
      if (day <= 12 && month > 12) [day, month] = [month, day];
      d = at(normaliseYear(Number(m[3])), month - 1, day);
    }
  }
  if (!d || Number.isNaN(d.getTime())) return null;
  const tomorrow = Date.now() + 86_400_000;
  const tenYearsAgo = Date.now() - 10 * 365 * 86_400_000;
  return d.getTime() > tomorrow || d.getTime() < tenYearsAgo ? null : d;
}

export function parseLocally(msg: InboundMessage, defaultCurrency: string): Transaction | null {
  const amount = extractAmount(msg.text, defaultCurrency);
  if (!amount) return null;
  const type = detectType(msg.text);
  const merchant = extractMerchant(msg.text, type);
  const bank = bankFromSender(msg.sender);
  const date = msg.source === 'paste' ? (extractDate(msg.text) ?? new Date(msg.receivedAt)) : new Date(msg.receivedAt);

  return {
    id: msg.id,
    source: msg.source,
    type,
    amount: amount.amount,
    currency: amount.currency,
    merchant: merchant ?? (bank ? `${bank} transaction` : 'Unknown'),
    category: guessCategory(msg.text, merchant, type),
    account: extractAccount(msg.text, msg.sender),
    date: date.toISOString(),
    balanceAfter: extractBalance(msg.text),
    note: null,
    sender: msg.sender,
    rawText: msg.text,
    parsedBy: 'local',
  };
}

export function isCategory(value: unknown): value is Category {
  return typeof value === 'string' && (CATEGORIES as readonly string[]).includes(value);
}
