export type ForecourtLiveEvent = {
  ts: number
  type: string
  data?: Record<string, unknown> | null
}

const MAX_LIVE_EVENTS = 200

const GLOBAL_KEY = '__VPOS_JPL_LIVE_EVENTS__'

function getBuffer(): ForecourtLiveEvent[] {
  const g = globalThis as any
  if (!Array.isArray(g[GLOBAL_KEY])) {
    g[GLOBAL_KEY] = []
  }
  return g[GLOBAL_KEY] as ForecourtLiveEvent[]
}

export function pushForecourtLiveEvent(
  type: string,
  data?: Record<string, unknown> | null,
) {
  const event: ForecourtLiveEvent = {
    ts: Date.now(),
    type: String(type || 'unknown'),
    data: data ?? null,
  }

  const next = getBuffer()
  next.push(event)
  if (next.length > MAX_LIVE_EVENTS) {
    next.splice(0, next.length - MAX_LIVE_EVENTS)
  }

  return event
}

export function listForecourtLiveEvents(limit = 50): ForecourtLiveEvent[] {
  const safeLimit = Math.max(1, Math.min(MAX_LIVE_EVENTS, Number(limit) || 50))
  return getBuffer().slice(-safeLimit).reverse()
}

export function clearForecourtLiveEvents() {
  const next = getBuffer()
  next.splice(0, next.length)
}
