import { setVposRestartConfig } from '@/src/shared/vpos/supervisor'

export async function updateVposRestartConfig(args: {
  stationId: string
  body: Record<string, unknown>
}) {
  if (!args.stationId) throw new Error('stationId is required')
  return await setVposRestartConfig(args.stationId, args.body || {})
}
