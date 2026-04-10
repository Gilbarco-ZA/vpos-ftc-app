import {
  ensurePlainObject,
  requireNonEmptyString,
} from '@/src/shared/utils/inputs'
import { getVposPosStatus } from '@/src/shared/vpos/pos'

export async function readVposPosStatus(args: { stationId: string }) {
  const normalizedStationId = requireNonEmptyString(args.stationId, 'stationId')
  const posStatus = await getVposPosStatus(normalizedStationId)
  return ensurePlainObject(posStatus)
}
