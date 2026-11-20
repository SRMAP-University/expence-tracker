import { useEffect } from 'react';
import { AppState } from 'react-native';

import { useLedger } from '@/hooks/use-ledger';
import { useSync } from '@/hooks/use-sync';
import { useStore } from '@/lib/store';
import { todayLiveUpdate, widgetFigures, widgetSnapshot } from '@/lib/widget-data';

import {
  cancelLiveUpdate,
  DEFAULT_WIDGET_CONFIG,
  getWidgetConfig,
  getWidgetIds,
  isHomeWidgetAvailable,
  postLiveUpdate,
  setWidgetSnapshot,
} from '../../modules/home-widget';

/** Several changes land together during a sync; push once they settle. */
const SETTLE_MS = 800;
/** Only a long run of AI sorting is worth a Live Update. */
const MIN_MESSAGES_FOR_PROGRESS = 10;

/**
 * Keeps the home screen widgets and the Live Updates (Live Alerts on OnePlus) in step with the
 * app's data: fresh figures whenever transactions, accounts or settings change, and when the app
 * comes back to the front (so "today" rolls over after midnight). With Live Alerts on, it also
 * shows the AI's progress while it sorts a large batch of messages.
 */
export function useWidgetSync() {
  const ledger = useLedger();
  const liveAlerts = useStore((s) => !!s.settings.liveSpending);
  const running = useSync((s) => s.running);
  const progress = useSync((s) => s.progress);

  useEffect(() => {
    if (!isHomeWidgetAvailable) return;

    const push = () => {
      // Before the saved data is read back, the ledger is empty; that must not reach the widget.
      if (!useStore.persist.hasHydrated()) return;
      const figures = widgetFigures(ledger, new Date());
      const widgets = getWidgetIds().map((id) => ({ id, config: getWidgetConfig(id) }));
      setWidgetSnapshot(widgetSnapshot(figures, widgets, DEFAULT_WIDGET_CONFIG));
      if (liveAlerts) postLiveUpdate('today', todayLiveUpdate(figures));
      else cancelLiveUpdate('today');
    };

    const timer = setTimeout(push, SETTLE_MS);
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') push();
    });
    return () => {
      clearTimeout(timer);
      subscription.remove();
    };
  }, [ledger, liveAlerts]);

  // The AI working through a big batch: a progress bar in the pill, gone when it finishes.
  const total = progress?.total ?? 0;
  const done = Math.min(progress?.done ?? 0, total);
  const sorting = liveAlerts && !!running && running !== 'paste' && total >= MIN_MESSAGES_FOR_PROGRESS;
  useEffect(() => {
    if (!isHomeWidgetAvailable) return;
    if (!sorting) {
      cancelLiveUpdate('ai');
      return;
    }
    postLiveUpdate('ai', {
      title: 'Sorting your messages',
      text: `${done} of ${total} read by the AI`,
      chip: `${Math.round((done / total) * 100)}%`,
      progress: done,
      max: total,
    });
  }, [sorting, done, total]);
}
