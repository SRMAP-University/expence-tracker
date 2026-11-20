import { requireOptionalNativeModule } from 'expo';
import { Platform } from 'react-native';

import { readReceipt, type ReceiptReading } from './openai';
import { getApiKey } from './secret-store';
import { useStore } from './store';

/**
 * Receipt scanning: a photo (new or from the gallery) is read by the AI into an amount, a
 * merchant, a category and a date. The camera library arrived with app build 1.0.2; it is
 * loaded only on builds that have it, so older builds just do not offer scanning.
 */
export const canScanReceipts =
  Platform.OS !== 'web' && requireOptionalNativeModule('ExponentImagePicker') != null;

/** Takes or picks a photo and reads it. Null when the user backs out of the camera or gallery. */
export async function scanReceipt(source: 'camera' | 'library'): Promise<ReceiptReading | null> {
  const apiKey = await getApiKey();
  if (!apiKey) throw new Error('Add your OpenAI key in Settings first: the AI reads the receipt.');

  const ImagePicker = await import('expo-image-picker');
  if (source === 'camera') {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) throw new Error('Expense AI was not allowed to use the camera. Allow it in the app’s settings.');
  }
  // Half quality keeps the photo small to send, and is still plenty to read print.
  const options = { mediaTypes: ['images' as const], quality: 0.5, base64: true };
  const result =
    source === 'camera' ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
  if (result.canceled || !result.assets?.[0]?.base64) return null;

  const asset = result.assets[0];
  const { settings } = useStore.getState();
  return readReceipt(asset.base64!, asset.mimeType ?? 'image/jpeg', {
    apiKey,
    model: settings.model,
    currency: settings.currency,
  });
}
