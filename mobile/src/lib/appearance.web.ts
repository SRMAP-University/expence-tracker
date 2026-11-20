import { Appearance } from 'react-native';

export type AppearancePref = 'system' | 'light' | 'dark';
export type ColorScheme = 'light' | 'dark';

const KEY = 'expense-ai-appearance';

export function readAppearancePref(): AppearancePref {
  try {
    const pref = globalThis.localStorage?.getItem(KEY);
    return pref === 'light' || pref === 'dark' ? pref : 'system';
  } catch {
    return 'system';
  }
}

export function saveAppearancePref(pref: AppearancePref) {
  try {
    globalThis.localStorage?.setItem(KEY, pref);
  } catch {}
}

export function systemScheme(): ColorScheme {
  return Appearance.getColorScheme() === 'dark' ? 'dark' : 'light';
}

export function resolveScheme(pref: AppearancePref): ColorScheme {
  return pref === 'system' ? systemScheme() : pref;
}

export async function restartApp() {
  globalThis.location?.reload();
}
