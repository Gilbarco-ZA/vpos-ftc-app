import { fiscalInboxRepository } from '@/src/modules/fiscal-inbox/infrastructure/persistence/fiscal-inbox.repository'

export async function findFiscalInboxByRequestIdQuery(args: {
  requestId: string
  stationId?: string | null
}) {
  const requestId = String(args.requestId || '').trim()
  if (!requestId) throw new Error('requestId is required')

  const stationId =
    args.stationId != null ? String(args.stationId).trim() || null : null

  return await fiscalInboxRepository.findByRequestId(requestId, stationId)
}

export async function getNewestFiscalInboxByRequestIdQuery(args: {
  requestId: string
  stationId?: string | null
}) {
  const requestId = String(args.requestId || '').trim()
  if (!requestId) throw new Error('requestId is required')

  const stationId =
    args.stationId != null ? String(args.stationId).trim() || null : null

  return await fiscalInboxRepository.getNewestByRequestId(requestId, stationId)
}
