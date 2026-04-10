import { getStationConfig } from '@/src/shared/config/loader'

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
    backend: integrations?.posBackend ?? null,
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
