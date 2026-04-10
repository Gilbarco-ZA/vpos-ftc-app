import { ensureDomsBackendAllowed } from '@/src/shared/doms/backend'

import { getForecourtSyncStatus } from './getForecourtSyncStatus'

export async function getAdminForecourtSyncStatus(stationId: string) {
  await ensureDomsBackendAllowed(stationId)
  const status = await getForecourtSyncStatus(stationId)
  return { status }
}
