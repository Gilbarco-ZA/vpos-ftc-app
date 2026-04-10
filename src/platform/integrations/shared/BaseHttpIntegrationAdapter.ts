import type { RetryOptions } from '@/src/platform/integrations/shared/http'
import type {
  HttpResponse,
  IntegrationCommandResult,
  IntegrationConfig,
  IntegrationHealthResult,
} from '@/src/platform/integrations/shared/types'

import {
  fetchWithTimeout,
  makeAuthHeaders,
  normalizeAbortError,
  withRetry,
} from '@/src/platform/integrations/shared/http'

/**
 * Abstract base for HTTP-based POS integration adapters.
 *
 * Subclasses implement:
 *  - `provider` — human-readable name for error messages
 *  - `loadConfig(stationId)` — resolve adapter-specific configuration
 *  - `dispatchCommand(cfg, cmd)` — route a POS command to the remote system
 *
 * Optionally override:
 *  - `buildHeaders(cfg)` — customise request headers
 *  - `retryOptions` — configure retry/back-off per adapter
 *  - `healthPath` — override the default `/health` endpoint
 */
export abstract class BaseHttpIntegrationAdapter {
  abstract readonly provider: string

  protected abstract loadConfig(
    stationId: string,
  ): Promise<IntegrationConfig | null>

  protected abstract dispatchCommand(
    cfg: IntegrationConfig,
    cmd: { type: string; payload?: unknown },
  ): Promise<IntegrationCommandResult>

  protected get retryOptions(): RetryOptions {
    return { retries: 1, delayMs: 250, backoff: 'fixed' }
  }

  protected get healthPath(): string {
    return '/health'
  }

  protected buildHeaders(cfg: IntegrationConfig): Record<string, string> {
    return makeAuthHeaders(cfg)
  }

  protected async fetch(
    url: string,
    init: RequestInit,
    timeoutMs: number,
  ): Promise<HttpResponse> {
    return fetchWithTimeout(url, init, timeoutMs)
  }

  protected async fetchWithRetry(
    url: string,
    init: RequestInit,
    timeoutMs: number,
  ): Promise<HttpResponse> {
    return withRetry(
      () => this.fetch(url, init, timeoutMs),
      this.provider,
      this.retryOptions,
    )
  }

  async health(stationId: string): Promise<IntegrationHealthResult> {
    const cfg = await this.loadConfig(stationId)
    if (!cfg) return { ok: true, configured: false }

    const url = `${cfg.baseUrl.replace(/\/+$/, '')}${this.healthPath}`
    const start = Date.now()

    try {
      const r = await this.fetchWithRetry(
        url,
        { method: 'GET', headers: this.buildHeaders(cfg) },
        cfg.timeoutMs ?? 10_000,
      )
      return {
        ok: r.ok,
        configured: true,
        provider: cfg.provider ?? this.provider,
        baseUrl: cfg.baseUrl,
        latencyMs: Date.now() - start,
        status: r.status,
      }
    } catch (e: unknown) {
      const err = normalizeAbortError(e, this.provider)
      return {
        ok: false,
        configured: true,
        provider: cfg.provider ?? this.provider,
        baseUrl: cfg.baseUrl,
        latencyMs: Date.now() - start,
        error: err.message,
      }
    }
  }

  async sendCommand(
    stationId: string,
    cmd: { type: string; payload?: unknown },
  ): Promise<IntegrationCommandResult> {
    const cfg = await this.loadConfig(stationId)
    if (!cfg) {
      return {
        ok: false,
        type: cmd.type,
        error: `${this.provider} not configured`,
      }
    }

    try {
      return await this.dispatchCommand(cfg, cmd)
    } catch (e: unknown) {
      const err = normalizeAbortError(e, this.provider)
      return { ok: false, type: cmd.type, error: err.message }
    }
  }
}
