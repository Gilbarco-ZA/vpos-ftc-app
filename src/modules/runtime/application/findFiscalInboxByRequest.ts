import {
  optionalNonEmptyString,
  requireNonEmptyString,
} from '@/src/shared/utils/inputs'

import { findFiscalInboxByRequestIdQuery } from '@/src/modules/fiscal-inbox/application/queries/find-fiscal-inbox-by-request-id'

export async function findFiscalInboxByRequest(args: {
  requestId: string
  stationId?: string | null
}) {
  const requestId = requireNonEmptyString(args.requestId, 'requestId')
  const stationId = optionalNonEmptyString(args.stationId) ?? null
  const items = await findFiscalInboxByRequestIdQuery({ requestId, stationId })
  return {
    requestId,
    stationId,
    count: items.length,
    items,
  }
}
