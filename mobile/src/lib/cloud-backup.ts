import { deleteSecret, getSecret, setSecret } from './secret-store';
import { useStore } from './store';

/**
 * Backup to the website's Neon database, through its /api/mobile endpoints. The phone pairs
 * once with the user's website login code and gets its own token back; the database password
 * stays on the server. Kept with the other secrets in the phone's secure storage.
 */
export const DEFAULT_SITE = 'https://expence-tracker-adarshs-projects-1953e79c.vercel.app';
const SECRET = 'cloud_backup';
/** Vercel refuses request bodies above ~4.5 MB. */
const MAX_BYTES = 4_000_000;

export type CloudLink = {
  site: string;
  token: string;
  /** Vercel's "protection bypass" secret, when the site is behind Vercel Authentication. */
  bypass?: string;
  user: { name: string | null; email: string };
};

export async function getCloudLink(): Promise<CloudLink | null> {
  const raw = await getSecret(SECRET).catch(() => null);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as CloudLink;
  } catch {
    return null;
  }
}

function headers(link: Pick<CloudLink, 'token' | 'bypass'>) {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${link.token}`,
    ...(link.bypass ? { 'x-vercel-protection-bypass': link.bypass } : null),
  };
}

async function readError(res: Response) {
  if (res.redirected || res.status === 401 || res.status === 403) {
    const text = await res.text().catch(() => '');
    if (/vercel/i.test(text) && /sso|login|authentication/i.test(text)) {
      return 'The website is behind Vercel’s login (Deployment Protection), so the app can’t reach it.';
    }
  }
  const body = (await res.json().catch(() => null)) as { error?: string } | null;
  return body?.error ?? `The website answered ${res.status}.`;
}

function cleanSite(site: string) {
  return site.trim().replace(/\/+$/, '');
}

/** Pairs this phone with the user's website account, using their website login code. */
export async function connectCloud(site: string, code: string, bypass?: string): Promise<CloudLink> {
  const base = cleanSite(site);
  const res = await fetch(`${base}/api/mobile/pair`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(bypass ? { 'x-vercel-protection-bypass': bypass } : null),
    },
    body: JSON.stringify({ code: code.trim(), deviceName: 'Expense AI (Android)' }),
  });
  if (!res.ok) throw new Error(await readError(res));
  const body = (await res.json()) as { token: string; user: CloudLink['user'] };
  const link: CloudLink = { site: base, token: body.token, bypass: bypass || undefined, user: body.user };
  await setSecret(SECRET, JSON.stringify(link));
  useStore.getState().setCloudBackup({ connected: true, error: null });
  return link;
}

/** Forgets the pairing here and on the website (the backup itself stays on the website). */
export async function disconnectCloud() {
  const link = await getCloudLink();
  if (link) {
    await fetch(`${link.site}/api/mobile/pair`, { method: 'DELETE', headers: headers(link) }).catch(() => {});
  }
  await deleteSecret(SECRET);
  useStore.getState().setCloudBackup({ connected: false, lastBackupAt: null, error: null });
}

/** Everything worth keeping, without secrets (keys and logins never leave secure storage). */
function snapshot() {
  const s = useStore.getState();
  return {
    version: 1,
    transactions: s.transactions,
    accounts: s.accounts,
    processed: s.processed,
    insights: s.insights,
    chat: s.chat,
    calcHistory: s.calcHistory,
    weeklySummary: s.weeklySummary,
    settings: s.settings,
    lastSmsSyncAt: s.lastSmsSyncAt,
  };
}

export async function backupNow(appVersion: string | null): Promise<string> {
  const link = await getCloudLink();
  if (!link) throw new Error('Not connected to the website.');
  let data = snapshot();
  let body = JSON.stringify({ data, appVersion, deviceName: 'Expense AI (Android)' });
  if (body.length > MAX_BYTES) {
    // The AI chat is the least important part; leave it out before giving up.
    data = { ...data, chat: [] };
    body = JSON.stringify({ data, appVersion });
    if (body.length > MAX_BYTES) throw new Error('The backup is too big to send in one go.');
  }
  try {
    const res = await fetch(`${link.site}/api/mobile/backup`, { method: 'PUT', headers: headers(link), body });
    if (!res.ok) throw new Error(await readError(res));
    const { savedAt } = (await res.json()) as { savedAt: string };
    const at = Date.parse(savedAt) || Date.now();
    useStore.getState().setCloudBackup({ lastBackupAt: at, error: null });
    return savedAt;
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    useStore.getState().setCloudBackup({ error: message });
    throw new Error(message);
  }
}

/** Replaces this phone's data with the website's backup. */
export async function restoreFromCloud(): Promise<{ savedAt: string; transactions: number }> {
  const link = await getCloudLink();
  if (!link) throw new Error('Not connected to the website.');
  const res = await fetch(`${link.site}/api/mobile/backup`, { headers: headers(link) });
  if (!res.ok) throw new Error(await readError(res));
  const { data, savedAt } = (await res.json()) as { data: ReturnType<typeof snapshot>; savedAt: string };
  if (!data || !Array.isArray(data.transactions) || !Array.isArray(data.accounts)) {
    throw new Error('That backup is not in a form this app can read.');
  }
  useStore.setState({
    transactions: data.transactions,
    accounts: data.accounts,
    processed: data.processed ?? {},
    insights: data.insights ?? {},
    chat: data.chat ?? [],
    calcHistory: data.calcHistory ?? [],
    weeklySummary: data.weeklySummary ?? null,
    settings: { ...useStore.getState().settings, ...(data.settings ?? {}) },
    lastSmsSyncAt: data.lastSmsSyncAt ?? null,
  });
  return { savedAt, transactions: data.transactions.length };
}
