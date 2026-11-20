import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';

import { useLedger } from '@/hooks/use-ledger';
import { useApiKey } from '@/lib/api-key';
import { generateWeeklySummary } from '@/lib/openai';
import { getApiKey } from '@/lib/secret-store';
import { useStore } from '@/lib/store';
import { localDay } from '@/lib/widget-data';
import { lastWeek, weeklyPayload } from '@/lib/weekly';

/** Startup is busy with syncing; the summary can wait a few seconds. */
const START_DELAY_MS = 5_000;

/**
 * Writes last week's summary once, the first time the app is opened in a new week. A failure
 * (offline, no credit) is tried again the next time the app opens, not on every change.
 */
export function useWeeklySummary() {
  const hasKey = useApiKey((s) => s.hasKey);
  const ledger = useLedger();
  const attempted = useRef<string | null>(null);

  useEffect(() => {
    if (!hasKey) return;

    const run = async () => {
      if (!useStore.persist.hasHydrated()) return;
      const now = new Date();
      const week = lastWeek(now);
      if (useStore.getState().weeklySummary?.weekStart === week.key || attempted.current === week.key) return;
      const payload = weeklyPayload(ledger.transactions, now, ledger.currency);
      if (payload.transactions === 0 && payload.income === 0) return;
      attempted.current = week.key;

      try {
        const apiKey = await getApiKey();
        if (!apiKey) return;
        const { headline, points } = await generateWeeklySummary(payload, {
          apiKey,
          model: useStore.getState().settings.model,
        });
        useStore.getState().setWeeklySummary({
          weekStart: week.key,
          weekEnd: localDay(new Date(week.end.getTime() - 86_400_000)),
          headline,
          points,
          spent: payload.spent,
          usualWeeklySpend: payload.usualWeeklySpend,
          currency: payload.currency,
          createdAt: Date.now(),
        });
      } catch {
        // Tried again next time the app comes to the front.
        attempted.current = null;
      }
    };

    const timer = setTimeout(run, START_DELAY_MS);
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') run();
    });
    return () => {
      clearTimeout(timer);
      subscription.remove();
    };
  }, [hasKey, ledger]);
}
