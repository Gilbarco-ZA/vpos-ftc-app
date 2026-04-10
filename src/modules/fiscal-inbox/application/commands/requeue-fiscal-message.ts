import { createFiscalInboxStatusService } from '@/src/modules/fiscal-inbox/application/services/fiscal-inbox-status-service'
import { fiscalInboxRepository } from '@/src/modules/fiscal-inbox/infrastructure/persistence/fiscal-inbox.repository'

const fiscalInboxStatusService = createFiscalInboxStatusService({
  repository: fiscalInboxRepository,
})

export async function requeueFiscalMessage(args: {
  id: number
  stationId: string
}) {
  const updated = await fiscalInboxStatusService.requeue(args)
  return updated
    ? { updated: true, action: 'REQUEUE' as const, id: updated }
    : null
}
