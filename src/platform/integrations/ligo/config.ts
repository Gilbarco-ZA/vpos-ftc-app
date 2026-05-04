import type { LigoConfig } from '@/src/platform/integrations/ligo/types'

import { getSystemConfiguration } from '@/src/platform/config/loader'

export async function getLigoConfig(
  stationId: string,
): Promise<LigoConfig | null> {
  const cfg = await getSystemConfiguration(stationId)
  const node = (cfg as any)?.integrations?.ligo
  if (!node?.baseUrl) return null
  return {
    baseUrl: String(node.baseUrl).replace(/\/+$/, ''),
    timeoutMs: node.timeoutMs ?? 10_000,
    apiKey: node.apiKey,
  };
}
