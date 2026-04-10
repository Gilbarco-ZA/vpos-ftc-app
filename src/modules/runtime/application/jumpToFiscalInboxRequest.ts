import {
  optionalNonEmptyString,
  requireNonEmptyString,
} from '@/src/shared/utils/inputs'

import { getNewestFiscalInboxByRequestIdQuery } from '@/src/modules/fiscal-inbox/application/queries/find-fiscal-inbox-by-request-id'

export async function jumpToFiscalInboxRequest(args: {
  requestId: string
  stationId?: string | null
}) {
  const requestId = requireNonEmptyString(args.requestId, 'requestId')
  const stationId = optionalNonEmptyString(args.stationId)
  const item = await getNewestFiscalInboxByRequestIdQuery({
    requestId,
    stationId,
  })
  if (!item) return { found: false }
  return { found: true, item }
}
