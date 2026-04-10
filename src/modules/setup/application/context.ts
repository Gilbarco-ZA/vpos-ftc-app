import type { UserRole } from '@/src/shared/types'

import {
  getOrCreateDefaultStationId,
  resolveSetupContext,
} from '@/src/shared/setup/publicContext'

export async function resolveSetupRequestContext(options?: {
  rolesWhenConfigured?: UserRole[]
}) {
  return await resolveSetupContext(options)
}

export async function getOrCreateSetupStationId() {
  return await getOrCreateDefaultStationId()
}
