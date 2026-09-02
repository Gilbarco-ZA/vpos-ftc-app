import {
  ensurePlainObject,
  requireNonEmptyString,
} from '@/src/shared/utils/inputs'

import { captureVposCustomerDetails } from '@/src/modules/vpos/application/pos'

export async function submitVposCustomerDetails(args: {
  stationId: string
  payload: Record<string, unknown>
}) {
  return await captureVposCustomerDetails(
    requireNonEmptyString(args.stationId, 'stationId'),
    ensurePlainObject(args.payload),
  )
}
