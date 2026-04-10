import type {
  FiscalInboxDetailRow,
  FiscalInboxListItem,
  FiscalInboxListResult,
} from '@/src/modules/fiscal-inbox/application/ports/fiscal-inbox-repository.port'
import type {
  FiscalInboxDetailViewModel,
  FiscalInboxItemViewModel,
  FiscalInboxListRowViewModel,
} from '@/src/modules/fiscal-inbox/presentation/view-models/fiscal-inbox.view-model'

import {
  extractTransactionId,
  normalizeFiscalInboxItem,
  normalizeFiscalInboxRows,
} from '@/src/modules/fiscal-inbox/infrastructure/persistence/fiscal-inbox.mapper'

export function presentFiscalInboxListRows(
  input: FiscalInboxListResult | FiscalInboxListItem[] | null | undefined,
): FiscalInboxListRowViewModel[] {
  const items = Array.isArray(input) ? input : (input?.items ?? [])
  return normalizeFiscalInboxRows(items)
}

export function presentFiscalInboxItem(
  row: FiscalInboxDetailRow | null | undefined,
): FiscalInboxItemViewModel | null {
  return normalizeFiscalInboxItem(row) as FiscalInboxItemViewModel | null
}

export function presentFiscalInboxDetail(
  row: FiscalInboxDetailRow | null | undefined,
): FiscalInboxDetailViewModel | null {
  return row ?? null
}

export function getFiscalInboxTransactionId(
  row: Pick<FiscalInboxDetailRow, 'message_json' | 'request_id'>,
): string | null {
  return extractTransactionId(row)
}
