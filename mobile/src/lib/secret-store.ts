import * as SecureStore from 'expo-secure-store';

const KEY = 'openai_api_key';

/** The OpenAI key lives in the Android Keystore / iOS Keychain, never in the JS bundle or the data file. */
export async function getApiKey() {
  return SecureStore.getItemAsync(KEY);
}

export async function setApiKey(value: string) {
  await SecureStore.setItemAsync(KEY, value);
}

export async function deleteApiKey() {
  await SecureStore.deleteItemAsync(KEY);
}

/** Any other secret, by name (e.g. exchange API keys). Same storage as the OpenAI key. */
export async function getSecret(name: string) {
  return SecureStore.getItemAsync(name);
}

export async function setSecret(name: string, value: string) {
  await SecureStore.setItemAsync(name, value);
}

export async function deleteSecret(name: string) {
  await SecureStore.deleteItemAsync(name);
}
