// Web is only used for previewing the UI; there is no secure enclave, so the key sits in localStorage.
const KEY = 'openai_api_key';

export async function getApiKey() {
  try {
    return globalThis.localStorage?.getItem(KEY) ?? null;
  } catch {
    return null;
  }
}

export async function setApiKey(value: string) {
  globalThis.localStorage?.setItem(KEY, value);
}

export async function deleteApiKey() {
  try {
    globalThis.localStorage?.removeItem(KEY);
  } catch {}
}

export async function getSecret(name: string) {
  try {
    return globalThis.localStorage?.getItem(name) ?? null;
  } catch {
    return null;
  }
}

export async function setSecret(name: string, value: string) {
  globalThis.localStorage?.setItem(name, value);
}

export async function deleteSecret(name: string) {
  try {
    globalThis.localStorage?.removeItem(name);
  } catch {}
}
