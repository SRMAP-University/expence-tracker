import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, StyleSheet, View } from 'react-native';
import Animated, { FadeOut, ZoomIn } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Colors, Font } from '@/constants/theme';
import {
  canUseAppLock,
  disableAppLock,
  enableAppLock,
  unlockWithFingerprint,
} from '@/lib/app-lock';
import { isCancelledPrompt } from '@/lib/bank-login';
import { useStore } from '@/lib/store';

import { AppText, Badge, Banner, Button, Card, IconBubble } from './ui';

/** Leaving the app for longer than this locks it again. */
const RELOCK_AFTER_MS = 30_000;

/**
 * Covers the whole app (drawers included) until the fingerprint is given, when app lock is on.
 * It locks as the app opens, and again after the app has been in the background for a while.
 */
export function AppLockScreen() {
  const enabled = useStore((s) => !!s.settings.appLock);
  const [locked, setLocked] = useState(enabled);
  const [message, setMessage] = useState<string | null>(null);
  const prompting = useRef(false);
  const backgroundAt = useRef<number | null>(null);

  useEffect(() => {
    if (!enabled) return;
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'background') backgroundAt.current = Date.now();
      else if (state === 'active' && backgroundAt.current !== null && !prompting.current) {
        if (Date.now() - backgroundAt.current > RELOCK_AFTER_MS) setLocked(true);
        backgroundAt.current = null;
      }
    });
    return () => subscription.remove();
  }, [enabled]);

  const unlock = useCallback(async () => {
    if (prompting.current) return;
    prompting.current = true;
    setMessage(null);
    try {
      const result = await unlockWithFingerprint();
      if (result === 'invalidated') {
        // Android dropped the lock's key: new fingerprints were added or the screen lock removed.
        await disableAppLock();
        useStore.getState().updateSettings({ appLock: false });
        setMessage(null);
      }
      setLocked(false);
    } catch (e) {
      if (!isCancelledPrompt(e)) setMessage(e instanceof Error ? e.message : String(e));
    } finally {
      prompting.current = false;
    }
  }, []);

  // Ask as soon as the lock screen is up; the button is there if the prompt is dismissed.
  useEffect(() => {
    if (!locked || !enabled) return;
    const timer = setTimeout(unlock, 300);
    return () => clearTimeout(timer);
  }, [locked, enabled, unlock]);

  if (!locked || !enabled) return null;

  return (
    <Animated.View exiting={FadeOut.duration(220)} style={[StyleSheet.absoluteFill, styles.cover]}>
      <SafeAreaView style={styles.center}>
        <Animated.View entering={ZoomIn.springify().damping(14)}>
          <IconBubble name="lock" tone="lime" size={72} />
        </Animated.View>
        <AppText variant="title" style={styles.title}>
          Expense AI is locked
        </AppText>
        <AppText variant="body" style={styles.subtitle}>
          Use your fingerprint to open it.
        </AppText>
        <Button label="Unlock" icon="lock" variant="onDark" onPress={unlock} style={styles.button} />
        {message && <AppText variant="caption" style={styles.error}>{message}</AppText>}
      </SafeAreaView>
    </Animated.View>
  );
}

/** Settings card: turn the lock on or off. Turning it off also asks for the fingerprint. */
export function AppLockSettings() {
  const enabled = useStore((s) => !!s.settings.appLock);
  const updateSettings = useStore((s) => s.updateSettings);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const available = canUseAppLock();

  async function toggle() {
    setBusy(true);
    setError(null);
    try {
      if (enabled) {
        const result = await unlockWithFingerprint();
        if (result === 'unlocked' || result === 'invalidated') {
          await disableAppLock();
          updateSettings({ appLock: false });
        }
      } else {
        await enableAppLock();
        updateSettings({ appLock: true });
      }
    } catch (e) {
      if (!isCancelledPrompt(e)) setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card style={styles.card}>
      <View style={styles.row}>
        <IconBubble name="lock" tone={enabled ? 'lime' : 'mint'} />
        <View style={styles.fill}>
          <AppText variant="label">App lock</AppText>
          <AppText variant="caption" color="textSecondary">
            {available
              ? 'Ask for your fingerprint when the app opens, and after 30 seconds away.'
              : 'Set up a fingerprint in the phone’s settings to use app lock.'}
          </AppText>
        </View>
        <Badge label={enabled ? 'On' : 'Off'} tone={enabled ? 'lime' : 'white'} />
      </View>
      {available && (
        <Button
          label={enabled ? 'Turn off' : 'Turn on'}
          variant={enabled ? 'secondary' : 'primary'}
          onPress={toggle}
          loading={busy}
          disabled={busy}
        />
      )}
      {error && <Banner tone="error" message={error} />}
    </Card>
  );
}

const styles = StyleSheet.create({
  cover: { backgroundColor: Colors.forest, zIndex: 1000, elevation: 1000 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 32 },
  title: { color: Colors.onForest, textAlign: 'center', marginTop: 12 },
  subtitle: { color: Colors.onForestMuted, textAlign: 'center' },
  button: { alignSelf: 'stretch', marginTop: 16 },
  error: { color: Colors.onForestMuted, textAlign: 'center', fontFamily: Font.medium },
  card: { gap: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  fill: { flex: 1 },
});
