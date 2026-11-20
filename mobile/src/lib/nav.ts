import { router, type Href } from 'expo-router';

/** Goes back, or to `fallback` when there is nothing to go back to (a screen opened by link). */
export function goBack(fallback: Href = '/') {
  if (router.canGoBack()) router.back();
  else router.replace(fallback);
}
