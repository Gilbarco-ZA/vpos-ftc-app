import { getSystemConfiguration } from '@/src/shared/config/loader'
import { requireNonEmptyString } from '@/src/shared/utils/inputs'

export type PosBackend = 'none' | 'jpl' | 'ppx' | 'ligo' | 'namos' | 'auto'

function normalizeBackend(value: unknown): PosBackend {
  const raw = String(value ?? '').trim()
  if (!raw) return 'auto'
  const lower = raw.toLowerCase()
  if (lower === 'none' || lower === 'db' || lower === 'dbfirst') return 'none'
  if (lower === 'jpl') return 'jpl'
  if (lower === 'ppx') return 'ppx'
  if (lower === 'ligo') return 'ligo'
  if (lower === 'namos') return 'namos'
  if (lower === 'auto') return 'auto'
  return 'auto'
}

export async function getEffectivePosBackend(
  stationId: string,
): Promise<PosBackend> {
  const cfg = await getSystemConfiguration(
    requireNonEmptyString(stationId, 'stationId'),
  )

  const raw = (cfg as any)?.integrations?.posBackend
  const explicit = raw != null && String(raw).trim() !== ''
  if (explicit) return normalizeBackend(raw)

  const hasJpl = Boolean(
    String((cfg as any)?.integrations?.jpl?.host ?? '').trim(),
  )
  return hasJpl ? 'jpl' : 'none'
}

export async function assertPosBackendAllowed(
  stationId: string,
  allowed: PosBackend[] | PosBackend,
): Promise<PosBackend> {
  const allow = Array.isArray(allowed) ? allowed : [allowed]
  const backend = await getEffectivePosBackend(stationId)
  if (!allow.includes(backend)) {
    throw Object.assign(
      new Error(
        `POS backend '${backend}' is not enabled (allowed: ${allow.join(', ')})`,
      ),
      { code: 'POS_BACKEND_DISABLED', status: 409, backend, allowed: allow },
    )
  }
  return backend
}
