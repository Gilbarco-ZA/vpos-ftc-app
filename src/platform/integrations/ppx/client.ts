import type {
  PosCommand,
  PosCommandResult,
} from '@/src/platform/integrations/ppx/types'
import type { RetryOptions } from '@/src/platform/integrations/shared/http'
import type {
  IntegrationCommandResult,
  IntegrationConfig,
} from '@/src/platform/integrations/shared/types'

import { getPpxConfig } from '@/src/platform/integrations/ppx/config'
import { BaseHttpIntegrationAdapter } from '@/src/platform/integrations/shared/BaseHttpIntegrationAdapter'

function normalizePath(p: string | undefined, fallback: string) {
  const s = String(p || '').trim()
  if (!s) return fallback
  return s.startsWith('/') ? s : `/${s}`
}

class PpxAdapter extends BaseHttpIntegrationAdapter {
  readonly provider = 'PPX'

  protected get retryOptions(): RetryOptions {
    return { retries: 2, delayMs: 300, backoff: 'linear' }
  }

  protected async loadConfig(
    stationId: string,
  ): Promise<IntegrationConfig | null> {
    const cfg = await getPpxConfig(stationId)
    if (!cfg) return null
    return {
      baseUrl: cfg.baseUrl,
      timeoutMs: cfg.timeoutMs,
      apiKey: cfg.apiKey,
      healthPath: cfg.healthPath,
      commandPath: cfg.commandPath,
    }
  }

  protected get healthPath(): string {
    return '/health'
  }

  protected buildHeaders(cfg: IntegrationConfig): Record<string, string> {
    const h: Record<string, string> = { 'content-type': 'application/json' }
    const key = cfg.apiKey as string | undefined
    if (key && key.trim().length > 0) {
      h['authorization'] = `Bearer ${key}`
      h['x-api-key'] = key
    }
    return h
  }

  protected async dispatchCommand(
    cfg: IntegrationConfig,
    cmd: { type: string; payload?: unknown },
  ): Promise<IntegrationCommandResult> {
    const commandPath = normalizePath(
      cfg.commandPath as string | undefined,
      '/pos/command',
    )
    const url = `${cfg.baseUrl}${commandPath}`

    const r = await this.fetchWithRetry(
      url,
      {
        method: 'POST',
        headers: this.buildHeaders(cfg),
        body: JSON.stringify(cmd),
      },
      cfg.timeoutMs ?? 10_000,
    )

    if (!r.ok) {
      const details = r.json ?? r.text
      return {
        ok: false,
        type: cmd.type,
        error: `PPX HTTP ${r.status}: ${
          (details as Record<string, any>)?.error?.message ??
          (details as Record<string, any>)?.message ??
          r.text
        }`,
        data: details,
      }
    }

    if (r.json && typeof r.json === 'object' && 'ok' in (r.json as object)) {
      const body = r.json as Record<string, unknown>
      return {
        ok: Boolean(body.ok),
        type: cmd.type,
        data: body.data ?? r.json,
        error: body.error as string | undefined,
      }
    }

    return { ok: true, type: cmd.type, data: r.json ?? r.text }
  }
}

const ppxAdapter = new PpxAdapter()

export async function ppxHealth(stationId: string) {
  return ppxAdapter.health(stationId)
}

export async function ppxSendPosCommand(
  stationId: string,
  cmd: PosCommand,
): Promise<PosCommandResult> {
  const result = await ppxAdapter.sendCommand(stationId, cmd)
  return {
    ok: result.ok,
    type: cmd.type,
    data: result.data,
    error: result.error,
  }
}
