import type { PpxConfig } from '@/src/platform/integrations/ppx/types'

import { getSystemConfiguration } from '@/src/platform/config/loader'

export async function getPpxConfig(
  stationId: string,
): Promise<PpxConfig | null> {
  const cfg = await getSystemConfiguration(stationId)
  const node = (cfg as any)?.integrations?.ppx
  if (!node?.baseUrl) return null
  return {
    baseUrl: String(node.baseUrl).replace(/\/+$/, ''),
    timeoutMs: node.timeoutMs ?? 10_000,
    apiKey: node.apiKey,
    healthPath: node.healthPath,
    commandPath: node.commandPath,
  };
}
