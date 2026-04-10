import { completeSetup } from '@/src/shared/setup/complete'
import { requireNonEmptyString } from '@/src/shared/utils/inputs'

export async function completeAdminSetup(
  stationId: string,
  body: Record<string, unknown> = {},
) {
  return await completeSetup(
    requireNonEmptyString(stationId, 'stationId'),
    body as any,
  )
}
