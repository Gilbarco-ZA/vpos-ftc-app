import { getForecourtSyncStatus } from './getForecourtSyncStatus'

export async function getAdminForecourtSyncStatus(stationId: string) {
  const status = await getForecourtSyncStatus(stationId)
  return { status }
}
