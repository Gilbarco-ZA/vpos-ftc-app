import { createFiscalInboxStatusService } from '@/src/modules/fiscal-inbox/application/services/fiscal-inbox-status-service'
import { fiscalInboxRepository } from '@/src/modules/fiscal-inbox/infrastructure/persistence/fiscal-inbox.repository'

const fiscalInboxStatusService = createFiscalInboxStatusService({
  repository: fiscalInboxRepository,
})

export async function markFiscalMessageFailed(args: {
  id: number
  stationId: string
  errorText: string
}) {
  const updated = await fiscalInboxStatusService.markFailed(args)
  return updated
    ? { updated: true, action: 'MARK_FAILED' as const, id: updated }
    : null
}
