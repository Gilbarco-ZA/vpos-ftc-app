import { requireNonEmptyString } from '@/src/shared/utils/inputs'

import { clearVposCustomerDetails } from '@/src/modules/vpos/application/pos'

export async function resetVposCustomerDetails(args: { stationId: string }) {
  return await clearVposCustomerDetails(
    requireNonEmptyString(args.stationId, 'stationId'),
  )
}
