import { requireOptionalNativeModule } from 'expo';

export type RawSms = {
  id: string;
  address: string;
  body: string;
  /** Epoch milliseconds. */
  date: number;
};

export type ReadInboxOptions = {
  sinceMs?: number;
  maxCount?: number;
};

type SmsReaderNativeModule = {
  hasPermission(): boolean;
  readInbox(options: ReadInboxOptions): Promise<RawSms[]>;
};

// Null in Expo Go, on iOS (Apple never exposes the SMS inbox) and on web.
const native = requireOptionalNativeModule<SmsReaderNativeModule>('SmsReader');

export const isSmsReaderAvailable = native != null;

export function hasSmsPermission(): boolean {
  return native?.hasPermission() ?? false;
}

export async function readInbox(options: ReadInboxOptions = {}): Promise<RawSms[]> {
  if (!native) {
    throw new Error('SMS reading is only available in an Android development or release build.');
  }
  return native.readInbox({ sinceMs: options.sinceMs ?? 0, maxCount: options.maxCount ?? 1000 });
}
