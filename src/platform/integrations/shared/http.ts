import type { HttpResponse } from '@/src/platform/integrations/shared/types'

export function normalizeAbortError(e: unknown, providerName: string): Error {
  if (!e) return new Error(`${providerName} unknown error`)
  const msg = (e as Error)?.message || String(e)
  if (msg.includes('aborted') || msg.includes('AbortError')) {
    const err = Object.assign(new Error(`${providerName} request timed out`), {
      code: 'TIMEOUT' as const,
    })
    return err
  }
  return e instanceof Error ? e : new Error(String(e))
}

export async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<HttpResponse> {
  const controller = new AbortController()
  const t = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(url, { ...init, signal: controller.signal })
    const text = await res.text()
    let json: unknown = null
    try {
      json = text ? JSON.parse(text) : null
    } catch {
      /* non-JSON response */
    }
    return { ok: res.ok, status: res.status, json, text }
  } finally {
    clearTimeout(t)
  }
}

export type RetryOptions = {
  retries?: number
  delayMs?: number
  backoff?: 'fixed' | 'linear'
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  providerName: string,
  opts: RetryOptions = {},
): Promise<T> {
  const { retries = 1, delayMs = 250, backoff = 'fixed' } = opts
  let lastErr: Error | undefined
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn()
    } catch (e: unknown) {
      lastErr = normalizeAbortError(e, providerName)
      if (attempt >= retries) break
      const delay = backoff === 'linear' ? delayMs * (attempt + 1) : delayMs
      await new Promise((r) => setTimeout(r, delay))
    }
  }
  throw lastErr
}

export function makeAuthHeaders(cfg: {
  apiKey?: string
  basicAuth?: { username: string; password: string }
}): Record<string, string> {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
  }
  if (cfg.basicAuth?.username && cfg.basicAuth?.password) {
    headers['authorization'] =
      'Basic ' +
      Buffer.from(
        `${cfg.basicAuth.username}:${cfg.basicAuth.password}`,
      ).toString('base64')
  } else if (cfg.apiKey) {
    headers['authorization'] = `Bearer ${cfg.apiKey}`
  }
  return headers
}
