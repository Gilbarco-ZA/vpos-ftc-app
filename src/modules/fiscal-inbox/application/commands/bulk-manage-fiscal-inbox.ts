import type { BulkManageFiscalInboxAction } from '@/src/modules/fiscal-inbox/application/ports/fiscal-inbox-repository.port'

import { fiscalInboxRepository } from '@/src/modules/fiscal-inbox/infrastructure/persistence/fiscal-inbox.repository'

export async function bulkManageFiscalInbox(args: {
  ids: number[]
  stationId?: string | null
  action: BulkManageFiscalInboxAction
  errorText?: string | null
}) {
  return await fiscalInboxRepository.bulkUpdate(args)
}

export async function requeueDeadFiscalMessages(args: {
  stationId: string
  ids?: number[] | null
}) {
  return await fiscalInboxRepository.requeueDead(args)
}
