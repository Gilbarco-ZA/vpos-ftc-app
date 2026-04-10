import type {
  PosCommand,
  PosCommandResult,
} from '@/src/platform/integrations/namos/types'
import type {
  IntegrationCommandResult,
  IntegrationConfig,
} from '@/src/platform/integrations/shared/types'

import { getNamosConfig } from '@/src/platform/integrations/namos/config'
import { BaseHttpIntegrationAdapter } from '@/src/platform/integrations/shared/BaseHttpIntegrationAdapter'

class NamosAdapter extends BaseHttpIntegrationAdapter {
  readonly provider = 'Namos'

  protected async loadConfig(
    stationId: string,
  ): Promise<IntegrationConfig | null> {
    const cfg = await getNamosConfig(stationId)
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
      error: 'namos POS backend is not implemented yet',
    }
  }
}

const namosAdapter = new NamosAdapter()

export async function namosHealth(stationId: string) {
  return namosAdapter.health(stationId)
}

export async function namosSendPosCommand(
  stationId: string,
  cmd: PosCommand,
): Promise<PosCommandResult> {
  const result = await namosAdapter.sendCommand(stationId, cmd)
  return {
    ok: result.ok,
    type: cmd.type,
    data: result.data,
    error: result.error,
  }
}
