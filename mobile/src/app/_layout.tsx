// Must stay first: installs the dev error reporter before any other app module runs.
import '@/lib/report-errors';

import {
  Urbanist_400Regular,
  Urbanist_500Medium,
  Urbanist_600SemiBold,
  Urbanist_700Bold,
  useFonts,
} from '@expo-google-fonts/urbanist';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useSyncExternalStore } from 'react';

import { AppLockScreen } from '@/components/app-lock';
import { Colors, isDark } from '@/constants/theme';
import { useAutoAnalyze } from '@/hooks/use-auto-analyze';
import { useAutoSync } from '@/hooks/use-auto-sync';
import { useCloudBackup } from '@/hooks/use-cloud-backup';
import { useOtaCheck } from '@/hooks/use-ota-check';
import { useReminderSync } from '@/hooks/use-reminder-sync';
import { useWeeklySummary } from '@/hooks/use-weekly-summary';
import { useSchemeWatcher } from '@/hooks/use-scheme-watcher';
import { useWidgetSync } from '@/hooks/use-widget-sync';
import { useApiKey } from '@/lib/api-key';
import { useStore } from '@/lib/store';

SplashScreen.preventAutoHideAsync().catch(() => {});

const baseTheme = isDark ? DarkTheme : DefaultTheme;
const navTheme = {
  ...baseTheme,
  colors: {
    ...baseTheme.colors,
    primary: Colors.accent,
    background: Colors.background,
    card: Colors.card,
    text: Colors.text,
    border: Colors.border,
  },
};

/**
 * Routes shown as a slide-up drawer over the page behind. The `Drawer` component animates
 * them itself, so the stack only lays them on top, see-through and without its own animation.
 */
const DRAWER = {
  presentation: 'transparentModal',
  animation: 'none',
  gestureEnabled: false,
  contentStyle: { backgroundColor: 'transparent' },
} as const;

/** True once the persisted store has been read back from disk. */
function useStoreHydrated() {
  return useSyncExternalStore(
    (onChange) => useStore.persist.onFinishHydration(onChange),
    () => useStore.persist.hasHydrated(),
    () => false
  );
}

export default function RootLayout() {
  const hydrated = useStoreHydrated();
  const [fontsLoaded, fontError] = useFonts({
    Urbanist_400Regular,
    Urbanist_500Medium,
    Urbanist_600SemiBold,
    Urbanist_700Bold,
  });
  const loadApiKey = useApiKey((s) => s.load);
  useAutoAnalyze();
  useAutoSync();
  useWidgetSync();
  useOtaCheck();
  useSchemeWatcher();
  useReminderSync();
  useWeeklySummary();
  useCloudBackup();
  // If the font files fail to load, carry on with the system font rather than a blank screen.
  const ready = hydrated && (fontsLoaded || !!fontError);

  useEffect(() => {
    loadApiKey();
  }, [loadApiKey]);

  useEffect(() => {
    if (ready) SplashScreen.hideAsync().catch(() => {});
  }, [ready]);

  if (!ready) return null;

  return (
    <ThemeProvider value={navTheme}>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: Colors.background } }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="settings" />
        <Stack.Screen name="transaction/[id]" options={DRAWER} />
        <Stack.Screen name="import" options={DRAWER} />
        <Stack.Screen name="add" options={DRAWER} />
        <Stack.Screen name="watch-apps" options={{ presentation: 'modal' }} />
        <Stack.Screen name="account/[id]" options={DRAWER} />
        <Stack.Screen name="widget" options={DRAWER} />
        <Stack.Screen name="calculator" options={DRAWER} />
        <Stack.Screen name="bills" options={DRAWER} />
      </Stack>
      <AppLockScreen />
    </ThemeProvider>
  );
}
