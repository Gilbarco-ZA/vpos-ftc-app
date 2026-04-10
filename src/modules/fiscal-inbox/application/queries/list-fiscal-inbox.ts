import type { FiscalInboxListFilters } from '@/src/modules/fiscal-inbox/application/ports/fiscal-inbox-repository.port'

import { fiscalInboxRepository } from '@/src/modules/fiscal-inbox/infrastructure/persistence/fiscal-inbox.repository'

export async function listFiscalInboxQuery(filters: FiscalInboxListFilters) {
  const stationId = String(filters.stationId || '').trim()
  if (!stationId) throw new Error('stationId is required')

  return await fiscalInboxRepository.list({
    ...filters,
    stationId,
  })
}
