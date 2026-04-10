import {
  ensurePlainObject,
  requireNonEmptyString,
} from '@/src/shared/utils/inputs'
import { getVposDailyData } from '@/src/shared/vpos/pos'

export async function readVposDailyData(args: { stationId: string }) {
  const normalizedStationId = requireNonEmptyString(args.stationId, 'stationId')
  const dailyData = await getVposDailyData(normalizedStationId)
  return ensurePlainObject(dailyData)
}
