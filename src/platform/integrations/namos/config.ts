import type { NamosConfig } from '@/src/platform/integrations/namos/types'

import { getSystemConfiguration } from '@/src/platform/config/loader'

export async function getNamosConfig(
  stationId: string,
): Promise<NamosConfig | null> {
  const cfg = await getSystemConfiguration(stationId)
  const node = (cfg as any)?.integrations?.namos
  if (!node?.baseUrl) return null
  return {
    baseUrl: String(node.baseUrl).replace(/\/+$/, ''),
    timeoutMs: node.timeoutMs ?? 10_000,
    apiKey: node.apiKey,
  }
}
