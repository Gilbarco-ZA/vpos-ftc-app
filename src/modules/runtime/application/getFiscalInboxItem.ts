import { getFiscalInboxByIdQuery } from '@/src/modules/fiscal-inbox/application/queries/get-fiscal-inbox-by-id'
import { normalizeFiscalInboxItem } from '@/src/modules/fiscal-inbox/infrastructure/persistence/fiscal-inbox.mapper'

export async function getFiscalInboxItem(args: {
  id: number
  stationId: string
}) {
  if (!Number.isFinite(args.id) || args.id <= 0)
    throw new Error('Invalid fiscal inbox id')
  if (!args.stationId) throw new Error('stationId is required')

  const row = await getFiscalInboxByIdQuery(args)
  return normalizeFiscalInboxItem(row)
}
