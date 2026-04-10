export type FiscalEngineMeta = {
  code: string
  label: string
  deprecated?: boolean
}

/**
 * Supported fiscal engines are configurable via env so we can add new countries
 * without touching the UI in every deployment.
 *
 * - VPOS_FISCAL_ENGINES="TZ,KE,mock"
 * - OR VPOS_FISCAL_ENGINES_JSON='[{"code":"TZ","label":"Tanzania (EWURA)"}, ...]'
 */
export function getSupportedFiscalEngines(): FiscalEngineMeta[] {
  const json = process.env.VPOS_FISCAL_ENGINES_JSON
  if (json && json.trim().length > 0) {
    try {
      const parsed = JSON.parse(json)
      if (Array.isArray(parsed)) {
        const out: FiscalEngineMeta[] = []
        for (const item of parsed) {
          if (!item) continue
          const code = String(item.code || '').trim()
          if (!code) continue
          out.push({
            code,
            label: String(item.label || code),
            deprecated: Boolean(item.deprecated),
          })
        }
        if (out.length > 0) return out
      }
    } catch {
      // fall through
    }
  }

  const raw = (process.env.VPOS_FISCAL_ENGINES || 'TZ,KE,mock')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)

  const defaults: Record<string, string> = {
    TZ: 'Tanzania (EWURA)',
    KE: 'Kenya (KRA)',
    mock: 'Mock (dev/test)',
  }

  const metas = raw.map((code) => ({
    code,
    label: defaults[code] ?? code,
  }))

  return metas.length ? metas : [{ code: 'mock', label: 'Mock (dev/test)' }]
}

export function isSupportedFiscalEngine(engine: string): boolean {
  const e = String(engine || '').trim()
  if (!e) return false
  return getSupportedFiscalEngines().some((m) => m.code === e)
}

export function assertSupportedFiscalEngine(engine: string): void {
  if (isSupportedFiscalEngine(engine)) return
  const supported = getSupportedFiscalEngines()
    .map((m) => m.code)
    .join(', ')
  throw new Error(
    `Unsupported fiscalization engine "${engine}". Supported: ${supported}`,
  )
}
