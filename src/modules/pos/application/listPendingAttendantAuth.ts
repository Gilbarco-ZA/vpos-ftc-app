import { getPendingAttendantAuthRequests } from '@/src/shared/pos/events'

export async function listPendingAttendantAuth(args: { stationId: string }) {
  if (!args.stationId) {
    throw new Error('stationId is required')
  }

  const pending = await getPendingAttendantAuthRequests(args.stationId)
  return { ok: true, pending }
}
