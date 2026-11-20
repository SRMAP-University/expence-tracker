import { useMemo } from 'react';

import { buildLedger, type Ledger } from '@/lib/money';
import { useStore } from '@/lib/store';

/** Transactions and accounts converted into the display currency. Use this for anything shown or totalled. */
export function useLedger(): Ledger {
  const transactions = useStore((s) => s.transactions);
  const accounts = useStore((s) => s.accounts);
  const settings = useStore((s) => s.settings);
  return useMemo(() => buildLedger({ transactions, accounts, settings }), [transactions, accounts, settings]);
}
