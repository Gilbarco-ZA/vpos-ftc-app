import { readStationLog } from '@/src/shared/logs/service'

export async function readVposRestartLog(args: { stationId: string }) {
  if (!args.stationId) throw new Error('stationId is required')
  return (
    (await readStationLog(args.stationId, 'restart', 'restart.log')) ?? {
      filename: 'restart.log',
      data: '',
    }
  )
}
