export type PosPendingAttendantAuthRecordInput = {
  id?: string
  requestId?: string
  fpId?: string | number | null
  reason?: string | null
  createdAt?: number | string | null
  payload?: unknown
}

export type PosPendingAttendantAuthClearInput = {
  id?: string
}
