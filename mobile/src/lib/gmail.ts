import { Platform, TurboModuleRegistry } from 'react-native';

import { bodyText, describeSender, emailForAi, type GmailPart } from './email-text';
import { redactMessage } from './sms-parser';
import type { InboundMessage } from './types';

/** Read-only: the app can list and read mail, never send, change or delete it. */
export const GMAIL_SCOPE = 'https://www.googleapis.com/auth/gmail.readonly';
const API = 'https://gmail.googleapis.com/gmail/v1/users/me';
const REQUEST_TIMEOUT_MS = 30_000;

/** What the Google Cloud Android OAuth client must be created with, for this build. */
export const ANDROID_PACKAGE = 'dev.expensetracker.ai';
/** SHA-1 of the signing key these APKs are built with (React Native's standard debug key). */
export const SIGNING_SHA1 = '5E:8F:16:06:2E:A3:CD:2C:4A:0D:54:78:76:BA:A6:F3:8C:AB:F6:25';

/**
 * The sign-in library looks up its native code the moment it is imported, and throws when that
 * code is missing (web, Expo Go, app builds made before Gmail support). So it is only loaded
 * after checking the native side exists.
 */
export const canUseGmail =
  Platform.OS === 'android' && !!(TurboModuleRegistry as { get?: (name: string) => unknown })?.get?.('RNGoogleSignin');

export class GmailError extends Error {
  constructor(
    message: string,
    /** Access has lapsed or was never granted; signing in again fixes it. */
    readonly needsReconnect = false
  ) {
    super(message);
    this.name = 'GmailError';
  }
}

type SignInModule = typeof import('@react-native-google-signin/google-signin');
let loaded: SignInModule | null = null;

function signIn(): SignInModule {
  if (!canUseGmail) {
    throw new GmailError('Gmail needs the latest version of the app installed on an Android phone.');
  }
  if (!loaded) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    loaded = require('@react-native-google-signin/google-signin') as SignInModule;
    // No client ID is needed on Android: Google matches this app by package name and signing key.
    loaded.GoogleSignin.configure({ scopes: [GMAIL_SCOPE] });
  }
  return loaded;
}

function describeSignInError(e: unknown): GmailError {
  if (e instanceof GmailError) return e;
  const { statusCodes } = signIn();
  const code = String((e as { code?: unknown })?.code ?? '');
  const message = e instanceof Error ? e.message : String(e);
  if (code === statusCodes.SIGN_IN_CANCELLED) return new GmailError('Gmail sign-in was cancelled.');
  if (code === statusCodes.IN_PROGRESS) return new GmailError('A Google sign-in is already open.');
  if (code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
    return new GmailError('Google Play services is missing or out of date on this phone.');
  }
  if (code === '10' || /DEVELOPER_ERROR/i.test(message)) {
    return new GmailError(
      `Google did not recognise this app. In Google Cloud, the Android OAuth client must use package ` +
        `${ANDROID_PACKAGE} and SHA-1 ${SIGNING_SHA1}, in the same project where the Gmail API is turned on.`
    );
  }
  return new GmailError(`Google sign-in failed: ${message}`);
}

/** Opens Google's account picker and consent screen. Returns the connected address. */
export async function connectGmail(): Promise<string> {
  const { GoogleSignin } = signIn();
  try {
    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
    const res = await GoogleSignin.signIn();
    if (res.type !== 'success') throw new GmailError('Gmail sign-in was cancelled.');
    let scopes = res.data.scopes ?? [];
    // Google lets people untick individual permissions; ask once more if mail access was left off.
    if (scopes.length > 0 && !scopes.includes(GMAIL_SCOPE)) {
      const added = await GoogleSignin.addScopes({ scopes: [GMAIL_SCOPE] });
      scopes = added?.type === 'success' ? (added.data.scopes ?? []) : [];
      if (!scopes.includes(GMAIL_SCOPE)) {
        throw new GmailError('Gmail access was not allowed. On Google’s screen, tick the box to read your email.');
      }
    }
  } catch (e) {
    throw describeSignInError(e);
  }
  // Prove the whole chain works (API turned on, permission granted) before reporting success.
  const profile = await gmailGet<{ emailAddress: string }>('/profile');
  return profile.emailAddress;
}

/** Signs out and withdraws the app's access to the mailbox. */
export async function disconnectGmail() {
  if (!canUseGmail) return;
  const { GoogleSignin } = signIn();
  await GoogleSignin.revokeAccess().catch(() => {});
  await GoogleSignin.signOut().catch(() => {});
}

async function accessToken(): Promise<string> {
  const { GoogleSignin } = signIn();
  try {
    if (!GoogleSignin.getCurrentUser()) {
      if (!GoogleSignin.hasPreviousSignIn()) throw new GmailError('Gmail is not connected.', true);
      const res = await GoogleSignin.signInSilently();
      if (res.type !== 'success') throw new GmailError('Gmail access has expired. Reconnect Gmail in Settings.', true);
    }
    return (await GoogleSignin.getTokens()).accessToken;
  } catch (e) {
    if (e instanceof GmailError) throw e;
    const code = String((e as { code?: unknown })?.code ?? '');
    if (code === signIn().statusCodes.SIGN_IN_REQUIRED) {
      throw new GmailError('Gmail access has expired. Reconnect Gmail in Settings.', true);
    }
    throw describeSignInError(e);
  }
}

async function gmailGet<T>(path: string, retried = false): Promise<T> {
  const token = await accessToken();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(`${API}${path}`, { headers: { Authorization: `Bearer ${token}` }, signal: controller.signal });
  } catch {
    throw new GmailError(controller.signal.aborted ? 'Gmail took too long to respond.' : 'Could not reach Gmail.');
  } finally {
    clearTimeout(timer);
  }
  if (res.ok) return (await res.json()) as T;

  const body = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
  const message = body.error?.message ?? '';
  if (res.status === 401) {
    // A cached token can expire early; clear it and try once with a fresh one.
    if (!retried) {
      await signIn().GoogleSignin.clearCachedAccessToken(token).catch(() => {});
      return gmailGet<T>(path, true);
    }
    throw new GmailError('Gmail access has expired. Reconnect Gmail in Settings.', true);
  }
  if (res.status === 403 && /has not been used|is disabled|not been enabled/i.test(message)) {
    throw new GmailError('The Gmail API is turned off in your Google Cloud project. Turn it on, then try again.');
  }
  if (res.status === 403) {
    throw new GmailError('Google refused access to your mail. Reconnect Gmail and allow reading your email.', true);
  }
  if (res.status === 429) throw new GmailError('Gmail is rate-limiting requests. Try again in a few minutes.');
  throw new GmailError(`Gmail request failed (${res.status}). ${message}`.trim());
}

/**
 * Narrows the mailbox to what could be a money movement. The AI still decides; this only keeps
 * newsletters and chat out of the request. Promotions and social mail are skipped outright.
 */
const TOPIC =
  '{payment paid received debited credited transaction payout transfer transferred deposit deposited ' +
  'withdrawal withdrawn refund refunded charged spent invoice receipt purchase "money sent" "you sent" ' +
  '"you received" "funds" "wire"}';

type ListResponse = { messages?: { id: string }[]; nextPageToken?: string };
type MessageResponse = {
  id: string;
  internalDate: string;
  payload?: GmailPart & { headers?: { name: string; value: string }[] };
};

/** Runs `worker` over `items`, `limit` at a time. */
async function mapLimited<T, R>(items: T[], limit: number, worker: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const run = async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await worker(items[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run));
  return results;
}

/**
 * Emails received after `sinceMs` that look money-related, newest first, as messages for the AI.
 * Ids for which `skip` returns true (already analysed) are not downloaded at all.
 */
export async function fetchFinanceEmails(opts: {
  sinceMs: number;
  max: number;
  skip: (id: string) => boolean;
}): Promise<{ listed: number; messages: InboundMessage[] }> {
  const q = `after:${Math.floor(opts.sinceMs / 1000)} -in:spam -in:trash -category:promotions -category:social ${TOPIC}`;
  const ids: string[] = [];
  let pageToken: string | undefined;
  do {
    const page = await gmailGet<ListResponse>(
      `/messages?maxResults=100&q=${encodeURIComponent(q)}${pageToken ? `&pageToken=${pageToken}` : ''}`
    );
    for (const m of page.messages ?? []) ids.push(m.id);
    pageToken = page.nextPageToken;
  } while (pageToken && ids.length < opts.max);

  const wanted = ids.slice(0, opts.max).filter((id) => !opts.skip(`email:${id}`));
  const fields = encodeURIComponent('id,internalDate,payload');
  const full = await mapLimited(wanted, 6, (id) => gmailGet<MessageResponse>(`/messages/${id}?format=full&fields=${fields}`));

  const messages = full.map((m) => {
    const header = (name: string) =>
      m.payload?.headers?.find((h) => h.name.toLowerCase() === name)?.value ?? '';
    return {
      id: `email:${m.id}`,
      source: 'email' as const,
      sender: describeSender(header('from')),
      text: redactMessage(emailForAi(header('subject'), bodyText(m.payload))),
      receivedAt: Number(m.internalDate) || Date.now(),
    };
  });
  return { listed: ids.length, messages };
}
