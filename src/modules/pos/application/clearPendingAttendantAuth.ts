import { badRequest } from '@/src/platform/web/api/response'
import { removePendingAttendantAuthRequest } from '@/src/shared/pos/events'

import type { PosPendingAttendantAuthClearInput } from './posEventTypes'

export async function clearPendingAttendantAuth(args: {
  stationId: string
  body: PosPendingAttendantAuthClearInput
}) {
  if (!args.stationId) {
    throw new Error('stationId is required')
  }

  const id = String(args.body?.id ?? '').trim()
  if (!id) {
    return badRequest('Missing id')
  }

  await removePendingAttendantAuthRequest(args.stationId, id)
  return { success: true }
}
