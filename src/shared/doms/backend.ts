import { assertPosBackendAllowed } from '@/src/shared/integrations/posBackend'
import { requireNonEmptyString } from '@/src/shared/utils/inputs'

export async function ensureDomsBackendAllowed(stationId: string) {
  await assertPosBackendAllowed(requireNonEmptyString(stationId, 'stationId'), [
    'jpl',
  ])
}
