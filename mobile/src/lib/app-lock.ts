import * as SecureStore from 'expo-secure-store';

/**
 * App lock, built on the same fingerprint-protected storage as bank logins: a small value is
 * saved behind the fingerprint, and the app opens only once Android hands it back, which it does
 * only after a successful fingerprint. Needs no extra native code, so it works on every build.
 */
const SERVICE = 'expense_ai_app_lock';
const KEY = 'app_lock_probe';

export function canUseAppLock(): boolean {
  try {
    return SecureStore.canUseBiometricAuthentication();
  } catch {
    return false;
  }
}

/** Turns the lock on. Asks for the fingerprint once, to prove it works. */
export async function enableAppLock() {
  await SecureStore.setItemAsync(KEY, 'unlocked', {
    keychainService: SERVICE,
    requireAuthentication: true,
    authenticationPrompt: 'Confirm to turn on app lock',
  });
}

export async function disableAppLock() {
  await SecureStore.deleteItemAsync(KEY, { keychainService: SERVICE }).catch(() => {});
}

/**
 * Asks for the fingerprint. 'unlocked' on success; 'invalidated' when Android has thrown the
 * lock's key away because the phone's fingerprints changed (then the lock must be set up again).
 * Throws when the prompt is cancelled or fails.
 */
export async function unlockWithFingerprint(): Promise<'unlocked' | 'invalidated'> {
  const value = await SecureStore.getItemAsync(KEY, {
    keychainService: SERVICE,
    requireAuthentication: true,
    authenticationPrompt: 'Unlock Expense AI',
  });
  return value ? 'unlocked' : 'invalidated';
}
