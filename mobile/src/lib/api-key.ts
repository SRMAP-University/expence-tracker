import { create } from 'zustand';

import { deleteApiKey, getApiKey, setApiKey } from './secret-store';

type ApiKeyState = {
  /** null until the secure store has been read. */
  hasKey: boolean | null;
  /** Last 4 characters, for display only. */
  hint: string | null;
  load: () => Promise<void>;
  save: (key: string) => Promise<void>;
  remove: () => Promise<void>;
};

export const useApiKey = create<ApiKeyState>((set) => ({
  hasKey: null,
  hint: null,
  load: async () => {
    const key = await getApiKey().catch(() => null);
    set({ hasKey: !!key, hint: key ? key.slice(-4) : null });
  },
  save: async (key) => {
    await setApiKey(key);
    set({ hasKey: true, hint: key.slice(-4) });
  },
  remove: async () => {
    await deleteApiKey();
    set({ hasKey: false, hint: null });
  },
}));
