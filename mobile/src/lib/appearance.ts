import { File, Paths } from 'expo-file-system';
import * as Updates from 'expo-updates';
import { Appearance, DevSettings } from 'react-native';

/** Light or dark: follow the phone, or always one of them. */
export type AppearancePref = 'system' | 'light' | 'dark';
export type ColorScheme = 'light' | 'dark';

/*
 * Kept in its own small file, read synchronously: the theme is chosen once, as the app starts,
 * before any screen's styles are created. Changing it restarts the app (see restartApp).
 */
function prefFile() {
  return new File(Paths.document, 'appearance.json');
}

export function readAppearancePref(): AppearancePref {
  try {
    const file = prefFile();
    if (!file.exists) return 'system';
    const pref = (JSON.parse(file.textSync()) as { pref?: string }).pref;
    return pref === 'light' || pref === 'dark' ? pref : 'system';
  } catch {
    return 'system';
  }
}

export function saveAppearancePref(pref: AppearancePref) {
  const file = prefFile();
  if (!file.exists) file.create({ intermediates: true });
  file.writeSync(JSON.stringify({ pref }));
}

export function systemScheme(): ColorScheme {
  return Appearance.getColorScheme() === 'dark' ? 'dark' : 'light';
}

export function resolveScheme(pref: AppearancePref): ColorScheme {
  return pref === 'system' ? systemScheme() : pref;
}

/** Starts the app again so every screen is drawn in the new theme. */
export async function restartApp() {
  try {
    if (Updates.isEnabled) {
      await Updates.reloadAsync();
      return;
    }
  } catch {
    // Fall through to the development reload.
  }
  DevSettings.reload();
}
