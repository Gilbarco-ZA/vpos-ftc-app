import { requireNonEmptyString } from '@/src/shared/utils/inputs'

import {
  RuntimeManager as CanonicalRuntimeManager,
  getRuntimeManager as getCanonicalRuntimeManager,
} from '@/src/modules/runtime/infrastructure/RuntimeManager'

export type RuntimeManager = CanonicalRuntimeManager

export function getRuntimeManager(stationId: string): RuntimeManager {
  return getCanonicalRuntimeManager(
    requireNonEmptyString(stationId, 'stationId'),
  )
}
