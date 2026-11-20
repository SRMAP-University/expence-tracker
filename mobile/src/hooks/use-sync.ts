import { create } from 'zustand';

import {
  importPastedText,
  MissingKeyError,
  reanalyzeMessages,
  SmsPermissionError,
  syncMessages,
  type AnalyzeResult,
  type Progress,
} from '@/lib/sync';

type Outcome = {
  tone: 'success' | 'warning' | 'error';
  message: string;
  /** Where the fix is: Android's settings for this app (SMS permission), or the in-app key field. */
  fix?: 'android-settings' | 'add-key';
};

type SyncState = {
  running: 'sms' | 'paste' | 'reanalyze' | null;
  progress: Progress | null;
  outcome: Outcome | null;
  runSmsSync: () => Promise<void>;
  /** Quiet sync when the app opens: uses only what is already allowed and speaks up only if it found something. */
  runAutoSync: () => Promise<void>;
  runPaste: (text: string) => Promise<Outcome>;
  runReanalyze: () => Promise<void>;
  dismiss: () => void;
};

function plural(n: number, word: string) {
  return `${n.toLocaleString()} ${word}${n === 1 ? '' : 's'}`;
}

function describe(r: AnalyzeResult, prefix: string): Outcome {
  if (r.failedBatches > 0) {
    return {
      tone: r.added > 0 ? 'warning' : 'error',
      message: `${prefix}${plural(r.added, 'transaction')} added, but some messages couldn't be analysed: ${r.errors[0] ?? 'unknown error'}`,
    };
  }
  return { tone: 'success', message: `${prefix}${plural(r.added, 'new transaction')} added.` };
}

const errorOutcome = (e: unknown): Outcome => ({
  tone: 'error',
  message: e instanceof Error ? e.message : String(e),
  fix: e instanceof SmsPermissionError ? 'android-settings' : e instanceof MissingKeyError ? 'add-key' : undefined,
});

export const useSync = create<SyncState>((set, get) => ({
  running: null,
  progress: null,
  outcome: null,

  runSmsSync: async () => {
    if (get().running) return;
    set({ running: 'sms', outcome: null, progress: { label: 'Starting', done: 0, total: 0 } });
    try {
      const r = await syncMessages((progress) => set({ progress }));
      let outcome: Outcome =
        r.candidates === 0
          ? { tone: 'success', message: `Scanned ${plural(r.scanned, 'message')}. Nothing new to add.` }
          : describe(r, `Scanned ${plural(r.scanned, 'message')} · `);
      if (r.sourceErrors.length) {
        outcome = { tone: 'warning', message: `${outcome.message} ${r.sourceErrors.join(' ')}` };
      }
      set({ outcome });
    } catch (e) {
      set({ outcome: errorOutcome(e) });
    } finally {
      set({ running: null, progress: null });
    }
  },

  runAutoSync: async () => {
    if (get().running) return;
    set({ running: 'sms', progress: { label: 'Checking for new messages', done: 0, total: 0 } });
    try {
      const r = await syncMessages((progress) => set({ progress }), { interactive: false });
      if (r.added > 0 || r.failedBatches > 0) set({ outcome: describe(r, '') });
    } catch {
      // A background check must never interrupt: a missing key or permission already has its own prompt.
    } finally {
      set({ running: null, progress: null });
    }
  },

  runPaste: async (text) => {
    set({ running: 'paste', outcome: null, progress: { label: 'Starting', done: 0, total: 0 } });
    let outcome: Outcome;
    try {
      const r = await importPastedText(text, (progress) => set({ progress }));
      const extras = [
        r.duplicates ? `${plural(r.duplicates, 'duplicate')} skipped` : null,
        r.skippedOtp ? `${plural(r.skippedOtp, 'OTP message')} ignored` : null,
        r.skipped - r.skippedOtp > 0 ? `${r.skipped - r.skippedOtp} without an amount ignored` : null,
      ].filter(Boolean);
      outcome = describe(r, '');
      if (extras.length) outcome = { ...outcome, message: `${outcome.message} ${extras.join(', ')}.` };
    } catch (e) {
      outcome = errorOutcome(e);
    }
    set({ running: null, progress: null, outcome });
    return outcome;
  },

  runReanalyze: async () => {
    if (get().running) return;
    set({ running: 'reanalyze', outcome: null, progress: { label: 'Starting', done: 0, total: 0 } });
    try {
      const r = await reanalyzeMessages((progress) => set({ progress }));
      set({
        outcome: r.failedBatches
          ? describe(r, 'Re-analysed with AI · ')
          : { tone: 'success', message: `AI sorted ${plural(r.analyzed, 'message')}.` },
      });
    } catch (e) {
      set({ outcome: errorOutcome(e) });
    } finally {
      set({ running: null, progress: null });
    }
  },

  dismiss: () => set({ outcome: null }),
}));
