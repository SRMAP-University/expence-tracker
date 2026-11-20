import { useEffect, useRef } from 'react';

import { useSync } from '@/hooks/use-sync';
import { useApiKey } from '@/lib/api-key';
import { useStore } from '@/lib/store';
import { accountsSignature, reanalyzable } from '@/lib/sync';

/** Long enough to add a second account, or fix a typo, before the AI starts. */
const SETTLE_MS = 4000;

/**
 * Keeps the AI's reading of your messages current without being asked. It re-sorts them when:
 *  - a key is saved and some transactions were never read by the AI, or
 *  - the accounts list changes (which changes what counts as a transfer).
 *
 * Each distinct situation is tried once. If a run fails, or leaves the same messages unread,
 * nothing has changed, so it waits for a new key, a new account or a manual run instead of looping.
 */
export function useAutoAnalyze() {
  const hasKey = useApiKey((s) => s.hasKey);
  const keyHint = useApiKey((s) => s.hint);
  const running = useSync((s) => s.running);
  const runReanalyze = useSync((s) => s.runReanalyze);
  const accountsChanged = useStore((s) => s.accountsChanged);
  const accounts = useStore((s) => accountsSignature(s.accounts));
  const unread = useStore((s) => reanalyzable(s.transactions).filter((t) => t.parsedBy === 'local').length);
  const messageCount = useStore((s) => reanalyzable(s.transactions).length);
  const attempted = useRef<string | null>(null);

  const due = !!hasKey && !running && messageCount > 0 && (unread > 0 || accountsChanged);
  const situation = `${keyHint}|${accounts}|${unread}|${accountsChanged}`;

  useEffect(() => {
    if (!due || attempted.current === situation) return;
    const timer = setTimeout(() => {
      attempted.current = situation;
      runReanalyze();
    }, SETTLE_MS);
    return () => clearTimeout(timer);
  }, [due, situation, runReanalyze]);
}
