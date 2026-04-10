import { fiscalInboxRepository } from '@/src/modules/fiscal-inbox/infrastructure/persistence/fiscal-inbox.repository'

export async function getFiscalInboxByIdQuery(args: {
  id: number
  stationId: string
}) {
  if (!Number.isFinite(args.id) || args.id <= 0) {
    throw new Error('Invalid fiscal inbox id')
  }

  const stationId = String(args.stationId || '').trim()
  if (!stationId) throw new Error('stationId is required')

  return await fiscalInboxRepository.getById(args.id, stationId)
}
