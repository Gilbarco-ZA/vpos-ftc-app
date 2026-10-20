import type { RecoveryReceiptRow } from './recoveryReceiptVerification'

/**
 * A missing receipt is recoverable only through a separate, explicitly
 * authorized creation path. More than one live receipt is ambiguous and
 * must never be resolved by choosing the newest row automatically.
 */
export function selectUniqueRecoveryReceipt(
  rows: readonly RecoveryReceiptRow[],
): RecoveryReceiptRow | null {
  if (rows.length > 1) {
    throw new Error('Ambiguous persisted receipts for recovered transaction')
  }
  return rows[0] ?? null
}
