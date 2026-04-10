import { listForecourtLiveEvents } from '@/src/shared/forecourt/admin'
import { requireNonEmptyString, toPositiveInt } from '@/src/shared/utils/inputs'

export async function listAdminForecourtLiveEvents(
  stationId: string,
  searchParams: URLSearchParams,
) {
  const normalizedStationId = requireNonEmptyString(stationId, 'stationId')
  const limit = toPositiveInt(searchParams.get('limit'), 50, 50)

  return {
    stationId: normalizedStationId,
    limit,
    data: listForecourtLiveEvents(limit),
  }
}
