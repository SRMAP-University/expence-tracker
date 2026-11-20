import { requireOptionalNativeModule } from 'expo';

export type CapturedNotification = {
  id: string;
  packageName: string;
  appName: string;
  title: string;
  text: string;
  /** Epoch milliseconds. */
  postedAt: number;
};

export type InstalledApp = { packageName: string; label: string };

type NotificationReaderNativeModule = {
  hasAccess(): boolean;
  openAccessSettings(): void;
  getWatchedPackages(): string[];
  setWatchedPackages(packages: string[]): void;
  listApps(): Promise<InstalledApp[]>;
  readCaptured(sinceMs: number, maxCount: number): Promise<CapturedNotification[]>;
  removeCaptured(upToMs: number): Promise<void>;
  // Added after the first notification build; missing from APKs made before it, so always optional.
  isListening?(): boolean;
  reconnect?(): void;
  captureActive?(): Promise<number>;
  pendingCount?(): number;
  addListener?(event: 'onCaptured', listener: () => void): { remove(): void };
};

// Null in Expo Go, on iOS and web, and in app builds made before this module existed.
const native = requireOptionalNativeModule<NotificationReaderNativeModule>('NotificationReader');

export const isNotificationReaderAvailable = native != null;

/** Whether the user has granted Android's "Notification access" to this app. */
export function hasNotificationAccess(): boolean {
  return native?.hasAccess() ?? false;
}

/** Opens the system screen where "Notification access" is granted. */
export function openNotificationAccessSettings() {
  native?.openAccessSettings();
}

/** Packages whose notifications are captured. Notifications from every other app are ignored. */
export function getWatchedPackages(): string[] {
  return native?.getWatchedPackages() ?? [];
}

export function setWatchedPackages(packages: string[]) {
  native?.setWatchedPackages(packages);
}

/** Apps with a launcher icon, for the picker. */
export async function listInstalledApps(): Promise<InstalledApp[]> {
  return native ? native.listApps() : [];
}

/** Notifications captured from watched apps since `sinceMs`, oldest first. */
export async function readCapturedNotifications(sinceMs = 0, maxCount = 500): Promise<CapturedNotification[]> {
  return native ? native.readCaptured(sinceMs, maxCount) : [];
}

/** Forgets captured notifications up to `upToMs`, once they have been processed. */
export async function removeCapturedNotifications(upToMs: number) {
  await native?.removeCaptured(upToMs);
}

/**
 * Whether Android has the listener running. Access can be granted while it is not (often after
 * the app is reinstalled), and then nothing is captured. A build too old to tell reports true,
 * so it never shows a warning it cannot act on.
 */
export function isNotificationListenerConnected(): boolean {
  if (!native) return false;
  return native.isListening?.() ?? true;
}

/** Asks Android to bind the listener again when access is granted but it is not running. */
export function reconnectNotificationListener() {
  native?.reconnect?.();
}

/** Stores what watched apps are showing right now; resolves to how many were new. */
export async function captureActiveNotifications(): Promise<number> {
  return (await native?.captureActive?.()) ?? 0;
}

/** How many captured notifications are waiting to be read. */
export function pendingNotificationCount(): number {
  return native?.pendingCount?.() ?? 0;
}

/** Calls `listener` each time a notification from a watched app is stored. Returns an unsubscribe. */
export function onNotificationCaptured(listener: () => void): () => void {
  const subscription = native?.addListener?.('onCaptured', listener);
  return () => subscription?.remove();
}
