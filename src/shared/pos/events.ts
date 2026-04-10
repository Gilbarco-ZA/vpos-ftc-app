import type { PendingAttendantAuthRequest } from '@/src/shared/pos/attendantAuth'

import {
  clearPendingAttendantAuthRequest,
  listPendingAttendantAuthRequests,
  recordPendingAttendantAuthRequest,
} from '@/src/shared/pos/attendantAuth'

export type PosPendingAttendantAuthRequest = PendingAttendantAuthRequest

export async function addPendingAttendantAuthRequest(
  stationId: string,
  item: PendingAttendantAuthRequest,
) {
  return await recordPendingAttendantAuthRequest(stationId, item)
}

export async function getPendingAttendantAuthRequests(stationId: string) {
  return await listPendingAttendantAuthRequests(stationId)
}

export async function removePendingAttendantAuthRequest(
  stationId: string,
  id: string,
) {
  return await clearPendingAttendantAuthRequest(stationId, id)
}
