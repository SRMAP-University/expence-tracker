import Constants from 'expo-constants';
import { Platform } from 'react-native';

/**
 * Expo Go only: forwards startup and render errors from a phone to the dev server
 * (POST /__app_error), so they can be read without having the device in hand.
 * Imported first in the root layout so it is installed before any app module runs.
 */
if (Platform.OS !== 'web' && Constants.expoGoConfig) {
  const host = Constants.expoGoConfig?.debuggerHost ?? Constants.expoConfig?.hostUri;
  const origin = host ? `${host.includes('exp.direct') ? 'https' : 'http'}://${host}` : null;
  let sent = 0;

  const send = (kind: string, message: string) => {
    if (!origin || sent++ > 12) return;
    fetch(`${origin}/__app_error`, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: `${kind}: ${message}`.slice(0, 6000),
    }).catch(() => {});
  };

  const describe = (value: unknown) => {
    if (value instanceof Error) return `${value.message}\n${value.stack ?? ''}`;
    if (typeof value === 'string') return value;
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  };

  const previousHandler = ErrorUtils.getGlobalHandler();
  ErrorUtils.setGlobalHandler((error, isFatal) => {
    send(isFatal ? 'FATAL' : 'ERROR', describe(error));
    previousHandler(error, isFatal);
  });

  const originalConsoleError = console.error;
  console.error = (...args: unknown[]) => {
    send('console.error', args.map(describe).join(' '));
    originalConsoleError(...args);
  };

  send('STARTED', `app code began on ${Platform.OS} ${Platform.Version}`);
}
