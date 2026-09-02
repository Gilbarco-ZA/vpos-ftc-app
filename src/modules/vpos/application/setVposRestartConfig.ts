import { setVposRestartConfig } from '@/src/modules/supervisor/application/vposSupervisor'

export async function updateVposRestartConfig(args: {
  stationId: string
  body: Record<string, unknown>
}) {
  if (!args.stationId) throw new Error('stationId is required')
  return await setVposRestartConfig(args.stationId, args.body || {})
}
