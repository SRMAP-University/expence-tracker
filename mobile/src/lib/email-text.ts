/**
 * Turning a Gmail API message into short plain text for the AI: base64url and UTF-8 decoding
 * (done by hand, since Hermes has no TextDecoder), HTML to text, and trimming.
 */

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
const B64_INDEX: Record<string, number> = {};
for (let i = 0; i < B64.length; i++) B64_INDEX[B64[i]] = i;

/** Gmail sends bodies as base64url. Standard base64 characters are accepted too. */
export function base64UrlToBytes(input: string): Uint8Array {
  const clean = input.replace(/\+/g, '-').replace(/\//g, '_').replace(/[^A-Za-z0-9\-_]/g, '');
  const out = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let o = 0;
  for (let i = 0; i + 1 < clean.length; i += 4) {
    const a = B64_INDEX[clean[i]];
    const b = B64_INDEX[clean[i + 1]];
    const c = i + 2 < clean.length ? B64_INDEX[clean[i + 2]] : -1;
    const d = i + 3 < clean.length ? B64_INDEX[clean[i + 3]] : -1;
    out[o++] = (a << 2) | (b >> 4);
    if (c >= 0) out[o++] = ((b & 15) << 4) | (c >> 2);
    if (d >= 0) out[o++] = ((c & 3) << 6) | d;
  }
  return out.subarray(0, o);
}

export function utf8Decode(bytes: Uint8Array): string {
  let out = '';
  let i = 0;
  while (i < bytes.length) {
    const b = bytes[i++];
    if (b < 0x80) {
      out += String.fromCharCode(b);
    } else if (b >= 0xc0 && b < 0xe0 && i < bytes.length) {
      out += String.fromCharCode(((b & 0x1f) << 6) | (bytes[i++] & 0x3f));
    } else if (b >= 0xe0 && b < 0xf0 && i + 1 < bytes.length) {
      out += String.fromCharCode(((b & 0x0f) << 12) | ((bytes[i++] & 0x3f) << 6) | (bytes[i++] & 0x3f));
    } else if (b >= 0xf0 && i + 2 < bytes.length) {
      const cp = ((b & 0x07) << 18) | ((bytes[i++] & 0x3f) << 12) | ((bytes[i++] & 0x3f) << 6) | (bytes[i++] & 0x3f);
      out += String.fromCodePoint(cp);
    } else {
      out += '�';
    }
  }
  return out;
}

const ENTITIES: Record<string, string> = {
  nbsp: ' ',
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  rsquo: '’',
  lsquo: '‘',
  rdquo: '”',
  ldquo: '“',
  ndash: '–',
  mdash: '—',
  hellip: '…',
  euro: '€',
  pound: '£',
  yen: '¥',
  copy: '©',
  reg: '®',
  trade: '™',
};

export function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, code: string) => {
    if (code[0] === '#') {
      const n = code[1] === 'x' || code[1] === 'X' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : whole;
    }
    return ENTITIES[code.toLowerCase()] ?? whole;
  });
}

export function htmlToText(html: string): string {
  return decodeEntities(
    html
      .replace(/<!--[\s\S]*?-->/g, ' ')
      .replace(/<(style|script|head|title)\b[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|tr|li|h[1-6]|table|section)>/gi, '\n')
      .replace(/<\/t[dh]>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
  );
}

/** Collapses whitespace, drops links and invisible characters, which only cost tokens. */
export function tidy(text: string): string {
  return text
    .replace(/[​-‏⁠﻿͏­]/g, '')
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/[ \t ]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{2,}/g, '\n')
    .trim();
}

export type GmailPart = {
  mimeType?: string;
  filename?: string;
  body?: { data?: string; size?: number };
  parts?: GmailPart[];
};

/** Bodies larger than this are cut before decoding; what matters is near the top. */
const MAX_BODY_BYTES = 60_000;

function decodePart(part: GmailPart): string {
  const data = part.body?.data;
  if (!data) return '';
  return utf8Decode(base64UrlToBytes(data.slice(0, Math.ceil((MAX_BODY_BYTES * 4) / 3))));
}

/** The readable body of a message: its plain-text part when there is one, else its HTML as text. */
export function bodyText(payload: GmailPart | undefined): string {
  if (!payload) return '';
  const plain: string[] = [];
  const html: string[] = [];
  const walk = (part: GmailPart) => {
    if (part.filename) return; // attachments
    const type = (part.mimeType ?? '').toLowerCase();
    if (type === 'text/plain') plain.push(decodePart(part));
    else if (type === 'text/html') html.push(decodePart(part));
    part.parts?.forEach(walk);
  };
  walk(payload);
  const usablePlain = plain.join('\n').trim();
  // Some senders put a stub in the plain part ("view this email in your browser").
  if (usablePlain.length >= 40 || html.length === 0) return tidy(usablePlain);
  return tidy(htmlToText(html.join('\n')));
}

/** "Stripe <notifications@stripe.com>" -> "Stripe (stripe.com)". The full address is not sent anywhere. */
export function describeSender(from: string): string {
  const email = /<([^>]+)>/.exec(from)?.[1] ?? (from.includes('@') ? from.trim() : '');
  const domain = email.split('@')[1]?.toLowerCase().trim() ?? '';
  // A "name" that is itself an address is not a name: never pass a full address on.
  const rawName = from.replace(/<[^>]*>/, '').replace(/["']/g, '').trim();
  const name = rawName.includes('@') ? '' : rawName;
  if (name && domain) return `${name} (${domain})`;
  return name || domain || 'Unknown sender';
}

/** Subject plus the start of the body: enough for the AI, small enough to keep each request cheap. */
export function emailForAi(subject: string, body: string, maxChars = 1800): string {
  return `Subject: ${subject.trim() || '(no subject)'}\n${body}`.slice(0, maxChars).trim();
}
