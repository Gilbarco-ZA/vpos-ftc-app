import { query } from '@/src/platform/db/postgres'

export type ArchiveEvent = {
  stationId: string
  topic: string
  messageType: string
  payload: any
  source?: string | null
  requestId?: string | null
}

const ARCHIVE_DEDUPE_WINDOW_MS = 3_000

function normalizeArchivePayload(ev: ArchiveEvent) {
  const payload = ev.payload ?? {}
  if (ev.source !== 'runtimeBus' || !payload || typeof payload !== 'object') {
    return payload
  }

  const clone = { ...(payload as Record<string, unknown>) }
  delete clone.at
  delete clone.timestamp
  delete clone.updatedAt
  delete clone.receivedAt
  return clone
}

function getArchiveDedupeCache() {
  const g = globalThis as any
  if (!g.__vposArchiveEventDedupe) {
    g.__vposArchiveEventDedupe = new Map<string, number>()
  }
  return g.__vposArchiveEventDedupe as Map<string, number>
}

function shouldSkipArchive(ev: ArchiveEvent, payloadJson: string) {
  const cache = getArchiveDedupeCache()
  const key = JSON.stringify([
    ev.stationId,
    ev.topic,
    ev.messageType,
    ev.source ?? null,
    ev.requestId ?? null,
    payloadJson,
  ])

  const now = Date.now()
  const last = cache.get(key) ?? 0
  cache.set(key, now)

  if (cache.size > 5000) {
    for (const [cacheKey, ts] of cache.entries()) {
      if (now - ts > 60_000) cache.delete(cacheKey)
    }
  }

  return now - last < ARCHIVE_DEDUPE_WINDOW_MS
}

export async function archiveEvent(ev: ArchiveEvent) {
  const payloadJson = JSON.stringify(normalizeArchivePayload(ev) ?? {})
  if (shouldSkipArchive(ev, payloadJson)) return

  await query(
    `INSERT INTO archive_events (station_id, topic, message_type, message_json, source, request_id)
     VALUES ($1,$2,$3,$4::jsonb,$5,$6)`,
    [
      ev.stationId,
      ev.topic,
      ev.messageType,
      payloadJson,
      ev.source ?? null,
      ev.requestId ?? null,
    ],
  )
}
