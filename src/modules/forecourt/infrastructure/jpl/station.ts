import { getStationId } from '@/src/shared/utils/getStationId'
import { isUuid } from '@/src/shared/utils/uuid'

import { fuelStationsRepo } from '@/src/modules/forecourt/infrastructure/repositories/fuelStationsRepo'

export const resolveStationId = async (): Promise<string | null> => {
  const envStation = getStationId()
  if (envStation && isUuid(envStation)) return envStation
  return await fuelStationsRepo.getActiveStationId()
}
