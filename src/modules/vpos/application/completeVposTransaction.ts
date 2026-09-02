import {
  ensurePlainObject,
  requireNonEmptyString,
} from '@/src/shared/utils/inputs'

import { completeVposTransaction } from '@/src/modules/vpos/application/pos'

export async function finalizeVposTransaction(args: {
  stationId: string
  payload: Record<string, unknown>
}) {
  return await completeVposTransaction(
    requireNonEmptyString(args.stationId, 'stationId'),
    ensurePlainObject(args.payload),
  )
}
