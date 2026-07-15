import { getEnvValue } from '@/src/shared/config/envDb'

import type {
  ProxyCreditNotesRequest,
  ProxyInvoiceRequest,
  ProxyInvoiceResponse,
  ProxyProductDto,
  ProxyProductResponse,
} from './types'
import { toSampleInvoicePayload } from './payload'

/**
 * Recursively strip null / undefined values from an object.
 * The cloud API (ASP.NET with additionalProperties:false) rejects
 * unknown-or-null fields, so we must omit them entirely.
 */
function stripNulls(obj: unknown): unknown {
  if (obj === null || obj === undefined) return undefined
  if (Array.isArray(obj)) {
    return obj.map(stripNulls).filter((v) => v !== undefined)
  }
  if (typeof obj === 'object' && obj !== null) {
    const cleaned: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(obj)) {
      const v = stripNulls(value)
      if (v !== undefined) cleaned[key] = v
    }
    return cleaned
  }
  return obj
}

async function baseUrl(stationId: string) {
  const raw = String(
    (await getEnvValue(stationId, 'VPOS_PROXY_URL', 'http://127.0.0.1:5555')) ??
      (await getEnvValue(stationId, 'VPOS_FISCALIZATION_URL')) ??
      '',
  ).trim()
  if (!raw) throw new Error('VPOS_PROXY_URL is not configured')
  return raw.replace(/\/+$/, '')
}

async function basePath(stationId: string) {
  const raw = String(
    (await getEnvValue(stationId, 'VPOS_PROXY_BASE_PATH', '/')) ?? '/',
  ).trim()
  if (!raw) return ''
  const p = raw.startsWith('/') ? raw : `/${raw}`
  return p.replace(/\/+$/, '')
}

async function parseProxyResponse(res: Response): Promise<any> {
  const contentType = res.headers.get('content-type')?.toLowerCase() ?? ''
  const body = await res.text()

  if (!body) return null

  if (contentType.includes('application/json')) {
    try {
      return JSON.parse(body)
    } catch {
      return {
        error: true,
        message: 'Invalid JSON response from proxy',
        rawBody: body,
      }
    }
  }

  try {
    return JSON.parse(body)
  } catch {
    return {
      error: true,
      message: 'Unexpected non-JSON response from proxy',
      rawBody: body,
    }
  }
}

export async function submitInvoiceToProxy(
  stationId: string,
  invoice: ProxyInvoiceRequest,
  opts?: { signal?: AbortSignal; idempotencyKey?: string },
): Promise<{ ok: boolean; status: number; data: ProxyInvoiceResponse | any }> {
  const url =
    (await baseUrl(stationId)) + (await basePath(stationId)) + '/api/invoices'
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json',
      ...(opts?.idempotencyKey
        ? { 'x-idempotency-key': opts.idempotencyKey }
        : {}),
    },
    signal: opts?.signal,
    body: JSON.stringify(stripNulls(toSampleInvoicePayload(invoice))),
  })

  const data = await parseProxyResponse(res)

  return { ok: res.ok, status: res.status, data }
}

export async function submitCreditNotesToProxy(
  stationId: string,
  payload: ProxyCreditNotesRequest,
  opts?: { signal?: AbortSignal; idempotencyKey?: string },
): Promise<{ ok: boolean; status: number; data: any }> {
  const url =
    (await baseUrl(stationId)) +
    (await basePath(stationId)) +
    '/api/creditnotes'

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json',
      ...(opts?.idempotencyKey
        ? { 'x-idempotency-key': opts.idempotencyKey }
        : {}),
    },
    signal: opts?.signal,
    body: JSON.stringify(stripNulls(payload)),
  })

  const data = await parseProxyResponse(res)

  return { ok: res.ok, status: res.status, data }
}
export async function submitProductToProxy(
  stationId: string,
  product: ProxyProductDto,
  opts?: { signal?: AbortSignal; idempotencyKey?: string },
): Promise<{ ok: boolean; status: number; data: ProxyProductResponse | any }> {
  const url =
    (await baseUrl(stationId)) + (await basePath(stationId)) + '/api/products'
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json',
      ...(opts?.idempotencyKey
        ? { 'x-idempotency-key': opts.idempotencyKey }
        : {}),
    },
    signal: opts?.signal,
    body: JSON.stringify(stripNulls(product)),
  })

  const data = await parseProxyResponse(res)

  return { ok: res.ok, status: res.status, data }
}

export async function submitStockInToProxy(
  stationId: string,
  payload: Record<string, unknown>,
  opts?: { signal?: AbortSignal; idempotencyKey?: string },
): Promise<{ ok: boolean; status: number; data: any }> {
  const url =
    (await baseUrl(stationId)) + (await basePath(stationId)) + '/api/stockin'
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json',
      ...(opts?.idempotencyKey
        ? { 'x-idempotency-key': opts.idempotencyKey }
        : {}),
    },
    signal: opts?.signal,
    body: JSON.stringify(stripNulls(payload)),
  })

  const data = await parseProxyResponse(res)

  return { ok: res.ok, status: res.status, data }
}
