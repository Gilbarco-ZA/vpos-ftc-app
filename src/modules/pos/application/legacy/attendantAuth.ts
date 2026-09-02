import { kvGet, kvSet } from '@/src/shared/storage/stationKv'

export type PendingAttendantAuthRequest = {
  id: string
  createdAt: number
  fpId?: string | number | null
  reason?: string | null
  payload?: any
}

const KEY_PENDING = 'vpos.pos.pendingAttendantAuth'

export async function recordPendingAttendantAuthRequest(
  stationId: string,
  item: PendingAttendantAuthRequest,
) {
  const current =
    (await kvGet<PendingAttendantAuthRequest[]>(stationId, KEY_PENDING)) ?? []
  await kvSet(stationId, KEY_PENDING, [...current, item])
}

export async function listPendingAttendantAuthRequests(stationId: string) {
  return (
    (await kvGet<PendingAttendantAuthRequest[]>(stationId, KEY_PENDING)) ?? []
  )
}

export async function clearPendingAttendantAuthRequest(
  stationId: string,
  id: string,
) {
  const current =
    (await kvGet<PendingAttendantAuthRequest[]>(stationId, KEY_PENDING)) ?? []
  await kvSet(
    stationId,
    KEY_PENDING,
    current.filter((x) => String(x.id) !== String(id)),
  )
}

export async function clearAllPendingAttendantAuthRequests(stationId: string) {
  await kvSet(stationId, KEY_PENDING, [])
}
