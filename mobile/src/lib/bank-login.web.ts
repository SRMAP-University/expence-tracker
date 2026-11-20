// Web is only for previewing the UI. A browser has no fingerprint-locked storage, so bank logins
// are never saved here (not even in localStorage); the form says they work on the phone only.

export type BankLogin = { loginId: string; password: string };

export function canSaveBankLogins(): boolean {
  return false;
}

export async function saveBankLogin(_accountId: string, _login: BankLogin): Promise<void> {
  throw new Error('Bank logins can only be saved on the phone.');
}

export async function readBankLogin(_accountId: string): Promise<BankLogin | null> {
  return null;
}

export async function deleteBankLogin(_accountId: string): Promise<void> {}

export function isCancelledPrompt(_error: unknown) {
  return false;
}
