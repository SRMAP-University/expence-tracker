import type { Transaction } from './types';

/** Two alerts this close together, for the same amount, are taken to be one payment. */
const SAME_PAYMENT_WINDOW_MS = 5 * 60 * 1000;

/**
 * A bank often texts about a payment that its app (or the payment app) also notifies about.
 * Within one batch the AI spots that; across batches and sync runs this catches it: same
 * direction, currency and amount, minutes apart, arriving through a different channel.
 *
 * Only cross-channel pairs count. Two SMS for the same amount minutes apart are far more
 * likely two real payments (two coffees, two UPI transfers) than one payment reported twice.
 */
export function alreadyRecorded(txn: Transaction, existing: Transaction[]) {
  const at = Date.parse(txn.date);
  return existing.some(
    (e) =>
      e.id !== txn.id &&
      e.source !== txn.source &&
      e.source !== 'manual' &&
      e.source !== 'demo' &&
      e.type === txn.type &&
      e.currency === txn.currency &&
      Math.abs(e.amount - txn.amount) < 0.005 &&
      Math.abs(Date.parse(e.date) - at) <= SAME_PAYMENT_WINDOW_MS
  );
}
