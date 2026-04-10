import { clearStationLog } from '@/src/shared/logs/service'
import { requireNonEmptyString } from '@/src/shared/utils/inputs'

export async function clearVposRestartLog(args: { stationId: string }) {
  await clearStationLog(
    requireNonEmptyString(args.stationId, 'stationId'),
    'restart',
    'restart.log',
  )
  return { message: 'Cleared' }
}
