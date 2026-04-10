import { fiscalInboxRepository } from '@/src/modules/fiscal-inbox/infrastructure/persistence/fiscal-inbox.repository'

export async function cloneRequeueFiscalMessage(args: {
  id: number
  stationId: string
  requestId?: string | null
  messageJson?: unknown
}) {
  const fiscalInboxId = await fiscalInboxRepository.cloneAndRequeue(args)
  return fiscalInboxId
    ? { cloned: true, action: 'CLONE_REQUEUE' as const, fiscalInboxId }
    : null
}

export async function bulkCloneRequeueFiscalMessage(args: {
  ids: number[]
  stationId?: string | null
  requestIdSuffix?: string
  override?: {
    merge?: Record<string, unknown>
    replace?: Record<string, unknown>
  }
}) {
  return await fiscalInboxRepository.bulkCloneAndRequeue(args)
}
