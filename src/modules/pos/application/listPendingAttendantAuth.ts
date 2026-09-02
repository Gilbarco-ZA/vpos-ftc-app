import { getPendingAttendantAuthRequests } from '@/src/modules/pos/application/legacy/events'

export async function listPendingAttendantAuth(args: { stationId: string }) {
  if (!args.stationId) {
    throw new Error('stationId is required')
  }

  const pending = await getPendingAttendantAuthRequests(args.stationId)
  return { ok: true, pending }
}
