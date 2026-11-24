export type DiagnosticLog = {
  filename: string
  data: string
  created_at: string
  updated_at: string
}

const names = new Set(['application.log', 'application-errors.log', 'errors.log'])

export function isVolatileDiagnostic(type: string, filename: string) {
  return process.env.VPOS_MANAGED_BY_START_SH === '1' &&
    type === 'live' && names.has(filename)
}

/** Bounded, process-local diagnostics shared across compiled server graphs. */
export class VolatileDiagnostics {
  private readonly rows = new Map<string, DiagnosticLog>()
  constructor(private readonly maxEntries = 24) {}

  private key(stationId: string, filename: string) {
    return JSON.stringify([stationId, filename])
  }

  append(stationId: string, filename: string, chunk: string, maxChars: number) {
    const key = this.key(stationId, filename)
    const previous = this.rows.get(key)
    const now = new Date().toISOString()
    const limit = Math.min(250_000, Math.max(10_000,
      Number.isFinite(maxChars) ? Math.trunc(maxChars) : 200_000))
    const data = [previous?.data, chunk.slice(-limit)].filter(Boolean).join('\n').slice(-limit)
    this.rows.delete(key)
    this.rows.set(key, { filename, data, created_at: previous?.created_at ?? now, updated_at: now })
    while (this.rows.size > this.maxEntries) {
      const oldest = this.rows.keys().next().value
      if (oldest === undefined) break
      this.rows.delete(oldest)
    }
  }

  get(stationId: string, filename: string) {
    return this.rows.get(this.key(stationId, filename))
  }

  list(stationId: string) {
    return [...names].flatMap(filename => {
      const row = this.get(stationId, filename)
      return row ? [row] : []
    })
  }

  clear(stationId: string, filename: string) {
    return this.rows.delete(this.key(stationId, filename))
  }
}

declare global {
  var __vposVolatileDiagnostics: VolatileDiagnostics | undefined
}

export const volatileDiagnostics = (globalThis.__vposVolatileDiagnostics ??=
  new VolatileDiagnostics())
