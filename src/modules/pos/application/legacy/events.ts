import type { PendingAttendantAuthRequest } from '@/src/modules/pos/application/legacy/attendantAuth'

import {
  clearPendingAttendantAuthRequest,
  listPendingAttendantAuthRequests,
  recordPendingAttendantAuthRequest,
} from '@/src/modules/pos/application/legacy/attendantAuth'

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
