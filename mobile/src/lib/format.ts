const formatterCache = new Map<string, Intl.NumberFormat>();

function localeFor(currency: string) {
  return currency === 'INR' ? 'en-IN' : 'en-US';
}

/** `decimals` is 0 for whole amounts / compact display, 2 otherwise (so 112.5 renders as 112.50). */
function getFormatter(currency: string, decimals: 0 | 2) {
  const key = `${currency}:${decimals}`;
  let formatter = formatterCache.get(key);
  if (!formatter) {
    try {
      formatter = new Intl.NumberFormat(localeFor(currency), {
        style: 'currency',
        currency,
        maximumFractionDigits: decimals,
        minimumFractionDigits: decimals,
      });
    } catch {
      // Unknown currency code: fall back to a plain number with the code as a prefix.
      formatter = new Intl.NumberFormat('en-US', { maximumFractionDigits: decimals, minimumFractionDigits: decimals });
    }
    formatterCache.set(key, formatter);
  }
  return formatter;
}

export function formatMoney(amount: number, currency: string, opts: { compact?: boolean } = {}) {
  const whole = Math.abs(amount - Math.round(amount)) < 0.005;
  const formatter = getFormatter(currency, opts.compact || whole ? 0 : 2);
  const text = formatter.format(amount);
  return formatter.resolvedOptions().style === 'currency' ? text : `${currency} ${text}`;
}

/**
 * Splits a formatted amount into its currency symbol and number so the symbol can be set small and raised.
 * "$1,029.39" -> { symbol: "$", value: "1,029.39" }; "AED 12" -> { symbol: "AED", value: "12" }.
 */
export function moneyParts(amount: number, currency: string, opts: { compact?: boolean } = {}) {
  const text = formatMoney(Math.abs(amount), currency, opts);
  const m = /^(\D+?)\s*(\d.*)$/.exec(text);
  return m ? { symbol: m[1].trim(), value: m[2] } : { symbol: '', value: text };
}

export function formatSignedMoney(amount: number, currency: string, type: 'debit' | 'credit') {
  return `${type === 'credit' ? '+' : '−'}${formatMoney(Math.abs(amount), currency)}`;
}

export function monthKey(date: Date | string) {
  const d = typeof date === 'string' ? new Date(date) : date;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function shiftMonth(key: string, delta: number) {
  const [y, m] = key.split('-').map(Number);
  return monthKey(new Date(y, m - 1 + delta, 1));
}

export function formatMonth(key: string) {
  const [y, m] = key.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

export function formatDay(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString('en-US', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: d.getFullYear() === today.getFullYear() ? undefined : 'numeric',
  });
}

export function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString('en-US', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function formatRelative(ms: number) {
  const diff = Date.now() - ms;
  const minutes = Math.round(diff / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  return `${days} d ago`;
}

export function percentChange(current: number, previous: number): number | null {
  if (previous <= 0) return null;
  return ((current - previous) / previous) * 100;
}

/** Unique-enough id for things created on this device, e.g. `acc:m3k9x2ab`. */
export function newId(prefix: string) {
  return `${prefix}:${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

/** Small, stable string hash (FNV-1a) used to give pasted messages deterministic ids. */
export function hashString(input: string) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}
