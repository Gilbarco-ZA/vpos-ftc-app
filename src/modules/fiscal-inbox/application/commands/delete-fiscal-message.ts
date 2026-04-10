import { fiscalInboxRepository } from '@/src/modules/fiscal-inbox/infrastructure/persistence/fiscal-inbox.repository'

export async function deleteFiscalMessage(args: {
  id: number
  stationId: string
}) {
  const deleted = await fiscalInboxRepository.deleteById(args)
  return deleted ? { deleted: true, id: deleted } : null
}
