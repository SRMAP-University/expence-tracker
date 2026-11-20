import { requireOptionalNativeModule } from 'expo';

/** What one widget shows. The app turns this into a WidgetModel; the native widget only draws. */
export type WidgetConfig = {
  /** The big figure. */
  show: 'month' | 'today' | 'left' | 'networth' | 'account';
  /** For `show: 'account'`. */
  accountId: string | null;
  /** A row of three small figures under the big one. */
  stats: boolean;
  /** A bar: how much of the month's income is spent (or of last month's spending). */
  progress: boolean;
  /** Up to four rows at the bottom. */
  list: 'recent' | 'categories' | 'accounts' | 'bills' | 'none';
};

export const DEFAULT_WIDGET_CONFIG: WidgetConfig = {
  show: 'month',
  accountId: null,
  stats: true,
  progress: true,
  list: 'recent',
};

/** A label and a value. `today` values show as zero once the day has passed without an update. */
export type WidgetItem = { label: string; value: string; today?: boolean };

/** Everything one widget draws, already formatted. Sections that do not fit its size are dropped. */
export type WidgetModel = WidgetItem & {
  stats: WidgetItem[];
  progress: { label: string; right: string; percent: number } | null;
  listTitle: string;
  list: { left: string; right: string; positive?: boolean }[];
};

export type WidgetSnapshot = {
  /** Local date the figures are for, YYYY-MM-DD. */
  day: string;
  /** Zero in the display currency, for `today` values after midnight. */
  zero: string;
  /** Per widget id. */
  models: Record<string, WidgetModel>;
  /** For a widget added since the app last ran. */
  fallback: WidgetModel;
} & LegacyWidgetFields;

/**
 * What the first widget build (app 1.0.0) reads: one figure per widget, chosen natively. Sent
 * alongside, so that build keeps working after it receives newer app code over the air.
 */
export type LegacyWidgetFields = {
  spentToday: string;
  spentMonth: string;
  left: string;
  leftLabel: string;
  netWorth: string;
  accounts: { id: string; name: string; balance: string }[];
  latest: string;
};

export type LiveUpdate = {
  title: string;
  text: string;
  /** The few characters shown in the status bar chip / Live Alerts pill. */
  chip: string;
  /** Progress bar; leave out for none. */
  progress?: number;
  max?: number;
};

type HomeWidgetNativeModule = {
  setSnapshot(json: string): void;
  getWidgetIds(): number[];
  getWidgetConfig(widgetId: number): string | null;
  setWidgetConfig(widgetId: number, json: string): void;
  canPinWidget(): boolean;
  pinWidget(): boolean;
  postLiveUpdate?(key: string, title: string, text: string, chip: string, progress: number, max: number): boolean;
  cancelLiveUpdate?(key: string): void;
  // The first widget build (app 1.0.0) had only the "today" Live Update.
  showLiveSpending?(title: string, text: string, chip: string): boolean;
  hideLiveSpending?(): void;
  liveUpdatesAllowed(): boolean;
  openNotificationSettings(): void;
};

// Null on iOS, web, and in app builds made before the widget existed.
const native = requireOptionalNativeModule<HomeWidgetNativeModule>('HomeWidget');

export const isHomeWidgetAvailable = native != null;

export function setWidgetSnapshot(snapshot: WidgetSnapshot) {
  native?.setSnapshot(JSON.stringify(snapshot));
}

/** Ids of the widgets on the home screen, in the order they were added. */
export function getWidgetIds(): number[] {
  return native?.getWidgetIds() ?? [];
}

export function getWidgetConfig(widgetId: number): WidgetConfig {
  const raw = native?.getWidgetConfig(widgetId);
  if (!raw) return DEFAULT_WIDGET_CONFIG;
  try {
    const saved = JSON.parse(raw) as Partial<WidgetConfig> & { latest?: boolean };
    // Widgets set up before sections existed had only "latest transaction" on or off.
    const list = saved.list ?? (saved.latest === false ? 'none' : 'recent');
    return { ...DEFAULT_WIDGET_CONFIG, ...saved, list };
  } catch {
    return DEFAULT_WIDGET_CONFIG;
  }
}

export function setWidgetConfig(widgetId: number, config: WidgetConfig) {
  native?.setWidgetConfig(widgetId, JSON.stringify(config));
}

export function canPinWidget(): boolean {
  return native?.canPinWidget() ?? false;
}

/** Asks the launcher to add the widget; it shows its own confirmation. */
export function pinWidget(): boolean {
  return native?.pinWidget() ?? false;
}

/** Posts or updates a Live Update by key. False when notifications are not allowed. */
export function postLiveUpdate(key: string, update: LiveUpdate): boolean {
  if (!native?.postLiveUpdate) {
    return key === 'today' ? (native?.showLiveSpending?.(update.title, update.text, update.chip) ?? false) : false;
  }
  return (
    native?.postLiveUpdate?.(
      key,
      update.title,
      update.text,
      update.chip,
      update.progress ?? -1,
      update.max ?? 0
    ) ?? false
  );
}

export function cancelLiveUpdate(key: string) {
  if (native?.cancelLiveUpdate) native.cancelLiveUpdate(key);
  else if (key === 'today') native?.hideLiveSpending?.();
}

/** Whether Android shows them as status bar chips (Android 16+, Live Updates allowed). */
export function liveUpdatesAllowed(): boolean {
  return native?.liveUpdatesAllowed() ?? false;
}

export function openNotificationSettings() {
  native?.openNotificationSettings();
}
