import { getHealth } from '@/src/platform/observability/health'
import { ok } from '@/src/platform/web/api/response'
import { getStationId } from '@/src/shared/utils/getStationId'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const GET = async () => {
  const stationId = getStationId()
  const health = await getHealth(stationId)
  return ok({ health })
}
