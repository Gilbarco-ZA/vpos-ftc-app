import { getStationConfig } from '@/src/shared/config/loader'

type PosBackendValue = 'none' | 'jpl' | 'ppx' | 'ligo' | 'namos' | 'auto'

const normalizePosBackendValue = (value: unknown): PosBackendValue => {
  const raw = String(value ?? '')
    .trim()
    .toLowerCase()
  if (raw === 'none' || raw === 'db' || raw === 'dbfirst') return 'none'
  if (raw === 'jpl') return 'jpl'
  if (raw === 'ppx') return 'ppx'
  if (raw === 'ligo') return 'ligo'
  if (raw === 'namos') return 'namos'
  if (raw === 'auto') return 'auto'
  return 'auto'
}

const deriveDefaultPosBackend = (integrations: any): PosBackendValue => {
  const raw = String(integrations?.posBackend ?? '').trim()
  if (raw) return normalizePosBackendValue(raw)
  return String(integrations?.jpl?.host ?? '').trim() ? 'jpl' : 'none'
}

export type PosIntegrationsView = {
  backend: unknown
  jpl: unknown
  ppx: unknown
  ligo: unknown
  namos: unknown
}

export function pickPosIntegrations(cfg: any): PosIntegrationsView {
  const integrations = (cfg as any)?.integrations ?? {}

  return {
    backend: deriveDefaultPosBackend(integrations),
    jpl: integrations?.jpl ?? null,
    ppx: integrations?.ppx ?? null,
    ligo: integrations?.ligo ?? null,
    namos: integrations?.namos ?? null,
  }
}

export async function loadPosIntegrations(
  stationId: string,
): Promise<PosIntegrationsView> {
  const row = await getStationConfig(stationId)
  const cfg = (row as any)?.configJson ?? (row as any)?.config_json ?? {}
  return pickPosIntegrations(cfg)
}
