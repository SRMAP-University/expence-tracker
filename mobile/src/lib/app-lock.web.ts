// The web preview has no fingerprint; app lock is a phone feature.
export function canUseAppLock(): boolean {
  return false;
}

export async function enableAppLock(): Promise<void> {
  throw new Error('App lock works on the phone only.');
}

export async function disableAppLock(): Promise<void> {}

export async function unlockWithFingerprint(): Promise<'unlocked' | 'invalidated'> {
  return 'unlocked';
}
