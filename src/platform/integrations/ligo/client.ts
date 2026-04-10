import type {
  PosCommand,
  PosCommandResult,
} from '@/src/platform/integrations/ligo/types'
import type {
  IntegrationCommandResult,
  IntegrationConfig,
} from '@/src/platform/integrations/shared/types'

import { getLigoConfig } from '@/src/platform/integrations/ligo/config'
import { BaseHttpIntegrationAdapter } from '@/src/platform/integrations/shared/BaseHttpIntegrationAdapter'

class LigoAdapter extends BaseHttpIntegrationAdapter {
  readonly provider = 'Ligo'

  protected async loadConfig(
    stationId: string,
  ): Promise<IntegrationConfig | null> {
    const cfg = await getLigoConfig(stationId)
    if (!cfg) return null
    return {
      baseUrl: cfg.baseUrl,
      timeoutMs: cfg.timeoutMs,
      apiKey: cfg.apiKey,
    }
  }

  protected async dispatchCommand(
    _cfg: IntegrationConfig,
    cmd: { type: string },
  ): Promise<IntegrationCommandResult> {
    // Stub — protocol not yet implemented
    return {
      ok: false,
      type: cmd.type,
      error: 'ligo POS backend is not implemented yet',
    }
  }
}

const ligoAdapter = new LigoAdapter()

export async function ligoHealth(stationId: string) {
  return ligoAdapter.health(stationId)
}

export async function ligoSendPosCommand(
  stationId: string,
  cmd: PosCommand,
): Promise<PosCommandResult> {
  const result = await ligoAdapter.sendCommand(stationId, cmd)
  return {
    ok: result.ok,
    type: cmd.type,
    data: result.data,
    error: result.error,
  }
}
