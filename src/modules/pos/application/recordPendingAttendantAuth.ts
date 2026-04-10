import { badRequest } from '@/src/platform/web/api/response'
import { addPendingAttendantAuthRequest } from '@/src/shared/pos/events'

import type { PosPendingAttendantAuthRecordInput } from './posEventTypes'

export async function recordPendingAttendantAuth(args: {
  stationId: string
  body: PosPendingAttendantAuthRecordInput
}) {
  if (!args.stationId) {
    throw new Error('stationId is required')
  }

  const input = (args.body || {}) as PosPendingAttendantAuthRecordInput
  const id = String(input.requestId ?? input.id ?? '').trim()
  if (!id) {
    return badRequest('Missing request id')
  }

  await addPendingAttendantAuthRequest(args.stationId, {
    id,
    createdAt: Number(input.createdAt ?? Date.now()),
    fpId: input.fpId ?? (input.payload as any)?.fpId ?? null,
    reason: input.reason ?? null,
    payload: input.payload ?? null,
  })

  return { success: true }
}
