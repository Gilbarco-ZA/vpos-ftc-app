import { queryOne } from '@/src/platform/db/postgres'
import { readAdapterState } from '@/src/shared/forecourt/sharedState'
import { requireNonEmptyString } from '@/src/shared/utils/inputs'

import { getJplTcpAdapterState } from '@/src/modules/forecourt/application/forecourtAdapters'

import type { ForecourtConnectionPayload } from '../types'

const FORECOURT_FRESH_MS = 30_000
const FORECOURT_STALE_MS = 5 * 60_000

const selectAdapterState = (
  localAdapterState: ReturnType<typeof getJplTcpAdapterState>,
  sharedAdapterState: Awaited<ReturnType<typeof readAdapterState>> | null,
) => {
  if (!sharedAdapterState) return localAdapterState

  const localLastSeen =
    localAdapterState.lastMessageAt ?? localAdapterState.lastConnectAt ?? 0
  const sharedLastSeen =
    sharedAdapterState.lastMessageAt ?? sharedAdapterState.lastConnectAt ?? 0

  if (localAdapterState.connected && !sharedAdapterState.connected) {
    return localAdapterState
  }

  if (sharedAdapterState.connected && !localAdapterState.connected) {
    return sharedAdapterState
  }

  return localLastSeen >= sharedLastSeen
    ? localAdapterState
    : sharedAdapterState
}

const getLastPersistedForecourtSeenAt = async (stationId: string) => {
  const row = await queryOne<{ last_seen_at: string | null }>(
    `
      SELECT MAX(received_at)::text AS last_seen_at
        FROM forecourt_events
       WHERE station_id = $1
         AND source IN ('jpl_tcp', 'ftc')
    `,
    [stationId],
  )

  if (!row?.last_seen_at) return null

  const ts = new Date(row.last_seen_at).getTime()
  return Number.isFinite(ts) ? ts : null
}

export async function getForecourtConnectionStatus(
  stationId: string,
): Promise<ForecourtConnectionPayload> {
  const normalizedStationId = requireNonEmptyString(stationId, 'stationId')

  const localAdapterState = getJplTcpAdapterState()
  const sharedAdapterState = await readAdapterState(normalizedStationId)
  const adapterState = selectAdapterState(localAdapterState, sharedAdapterState)

  const runtimeLastSeenAt =
    adapterState.lastMessageAt ?? adapterState.lastConnectAt ?? null

  const persistedLastSeenAt =
    await getLastPersistedForecourtSeenAt(normalizedStationId)

  const lastSeenAt =
    Math.max(runtimeLastSeenAt ?? 0, persistedLastSeenAt ?? 0) || null

  const connected = Boolean(adapterState.connected)
  const reconnectAttempts = Number(adapterState.reconnectAttempts ?? 0)

  const ageMs = lastSeenAt == null ? null : Math.max(0, Date.now() - lastSeenAt)

  let status: ForecourtConnectionPayload['status'] = 'offline'

  if (connected && ageMs != null && ageMs <= FORECOURT_FRESH_MS) {
    status = 'online'
  } else if (connected || (ageMs != null && ageMs <= FORECOURT_STALE_MS)) {
    status = 'degraded'
  } else {
    status = 'offline'
  }

  return {
    stationId: normalizedStationId,
    status,
    lastSeenAt,
    reconnectAttempts,
    connected,
    ageMs,
  }
}
