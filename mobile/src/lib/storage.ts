import { File, Paths } from 'expo-file-system';
import type { StateStorage } from 'zustand/middleware';

/**
 * Persists the store as a JSON file in the app's document directory.
 * A file has no per-entry size cap (unlike AsyncStorage's ~2 MB row limit on Android),
 * and writes are serialised + coalesced so rapid state changes never interleave on disk.
 */
const queues = new Map<string, { writing: boolean; pending: string | null }>();

function fileFor(name: string) {
  return new File(Paths.document, `${name}.json`);
}

async function flush(name: string) {
  const q = queues.get(name);
  if (!q || q.writing) return;
  q.writing = true;
  try {
    while (q.pending !== null) {
      const value = q.pending;
      q.pending = null;
      const file = fileFor(name);
      if (!file.exists) file.create({ intermediates: true });
      await file.write(value);
    }
  } finally {
    q.writing = false;
  }
}

export const persistStorage: StateStorage = {
  async getItem(name) {
    const file = fileFor(name);
    return file.exists ? await file.text() : null;
  },
  async setItem(name, value) {
    const q = queues.get(name) ?? { writing: false, pending: null };
    q.pending = value;
    queues.set(name, q);
    await flush(name);
  },
  async removeItem(name) {
    const q = queues.get(name);
    if (q) q.pending = null;
    const file = fileFor(name);
    if (file.exists) file.delete();
  },
};
