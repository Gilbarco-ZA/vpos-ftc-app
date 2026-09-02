import { listForecourtLiveEvents } from '@/src/modules/forecourt/application/forecourtAdmin'

import { listForecourtEvents } from '../infrastructure/adminRepo'

export async function listAdminForecourtEvents(
  stationId: string,
  searchParams: URLSearchParams,
) {
  const limit = Math.min(
    200,
    Math.max(1, Number(searchParams.get('limit') || 50)),
  )
  const since = searchParams.get('since')
  const until = searchParams.get('until')
  const source = searchParams.get('source')
  const eventType =
    searchParams.get('eventType') || searchParams.get('event_type')
  const pumpId = searchParams.get('pumpId') || searchParams.get('pump_id')
  const action = searchParams.get('action')
  const includeLive =
    String(searchParams.get('includeLive') ?? 'true').toLowerCase() !== 'false'
  const liveLimit = Math.min(
    50,
    Math.max(1, Number(searchParams.get('liveLimit') || 50)),
  )

  const data = await listForecourtEvents({
    stationId,
    limit,
    since,
    until,
    source,
    eventType,
    pumpId,
    action,
  })

  return {
    stationId,
    limit,
    since,
    until,
    filters: { source, eventType, pumpId, action },
    data,
    live: {
      enabled: includeLive,
      limit: liveLimit,
      data: includeLive ? listForecourtLiveEvents(liveLimit) : [],
    },
  }
}
