import * as SecureStore from 'expo-secure-store';

/**
 * Bank logins (user ID and password), one per account, in the phone's secure storage.
 *
 * Each is encrypted with a Keystore key that Android unlocks only after a fingerprint (or other
 * strong biometric), so saving and showing a login both ask for it. They never enter the app's
 * data file, are never sent to OpenAI or anywhere else, and must never be logged: console
 * output reaches the dev server (see report-errors.ts).
 *
 * They use their own keychain service: an authenticated key cannot share one with the
 * unauthenticated values (the OpenAI key, Binance keys).
 */
const SERVICE = 'expense_ai_bank_logins';

export type BankLogin = { loginId: string; password: string };

function keyFor(accountId: string) {
  return `bank_login_${accountId.replace(/[^A-Za-z0-9._-]/g, '_')}`;
}

function options(prompt: string): SecureStore.SecureStoreOptions {
  return { keychainService: SERVICE, requireAuthentication: true, authenticationPrompt: prompt };
}

/** Whether this phone can protect a login with a fingerprint. Without one, logins are not saved. */
export function canSaveBankLogins(): boolean {
  try {
    return SecureStore.canUseBiometricAuthentication();
  } catch {
    return false;
  }
}

export async function saveBankLogin(accountId: string, login: BankLogin) {
  await SecureStore.setItemAsync(keyFor(accountId), JSON.stringify(login), options('Confirm to save this login'));
}

/**
 * The saved login, after a fingerprint. Null when there is none, or when Android has made it
 * unreadable (fingerprints changed or the screen lock was removed) and it must be entered again.
 */
export async function readBankLogin(accountId: string): Promise<BankLogin | null> {
  const value = await SecureStore.getItemAsync(keyFor(accountId), options('Show bank login'));
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as Partial<BankLogin>;
    return { loginId: parsed.loginId ?? '', password: parsed.password ?? '' };
  } catch {
    return null;
  }
}

/** Removes a saved login. Needs no fingerprint. */
export async function deleteBankLogin(accountId: string) {
  await SecureStore.deleteItemAsync(keyFor(accountId), { keychainService: SERVICE });
}

/** True for the error a dismissed fingerprint prompt gives, which needs no message. */
export function isCancelledPrompt(error: unknown) {
  return /cancel/i.test(error instanceof Error ? error.message : String(error));
}
