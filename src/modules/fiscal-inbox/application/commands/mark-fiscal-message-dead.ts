import { createFiscalInboxStatusService } from '@/src/modules/fiscal-inbox/application/services/fiscal-inbox-status-service'
import { fiscalInboxRepository } from '@/src/modules/fiscal-inbox/infrastructure/persistence/fiscal-inbox.repository'

const fiscalInboxStatusService = createFiscalInboxStatusService({
  repository: fiscalInboxRepository,
})

export async function markFiscalMessageDead(args: {
  id: number
  stationId: string
  errorText: string
}) {
  const updated = await fiscalInboxStatusService.markDead(args)
  return updated
    ? { updated: true, action: 'MARK_DEAD' as const, id: updated }
    : null
}
