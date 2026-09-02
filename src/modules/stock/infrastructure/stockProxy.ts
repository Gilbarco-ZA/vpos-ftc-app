import { queryOne } from '@/src/platform/db/postgres'
import { AppError } from '@/src/shared/errors/AppError'

import { stockMovementRequiresProxy } from '@/src/modules/stock/domain/stockMovement'
import {
  getStockMovementPayloadSourceRepo,
  getStockMovementRepo,
  updateStockMovementProxyResultRepo,
} from '@/src/modules/stock/infrastructure/stock.repository'
import {
  assessStockProxyResponse,
  buildStockProxyPayload,
} from '@/src/modules/stock/infrastructure/stockPayload'
import { resolveStockProxyTargetValues } from '@/src/modules/stock/infrastructure/stockProxyTarget'

async function resolveStockProxyTarget(stationId: string) {
  const stationSettings = await queryOne<{
    proxy_url: string | null
    proxy_base_path: string | null
    station_kv_jpl_host: string | null
    station_config_jpl_host: string | null
  }>(
    `SELECT ss.proxy_url,
            ss.proxy_base_path,
            NULLIF(BTRIM(jpl_host.value #>> '{}'), '') AS station_kv_jpl_host,
            NULLIF(BTRIM(sc.config_json #>> '{integrations,jpl,host}'), '') AS station_config_jpl_host
       FROM (SELECT $1::uuid AS station_id) station
       LEFT JOIN station_settings ss
         ON ss.station_id = station.station_id
       LEFT JOIN station_config sc
         ON sc.station_id = station.station_id
       LEFT JOIN station_kv jpl_host
         ON jpl_host.station_id = station.station_id
        AND jpl_host.key = 'env:JPL_TCP_HOST'
      LIMIT 1`,
    [stationId],
  )

  const nodeEnv = process.env.NODE_ENV
  return resolveStockProxyTargetValues({
    nodeEnv,
    configuredBaseUrl: stationSettings?.proxy_url,
    configuredBasePath: stationSettings?.proxy_base_path,
    persistedJplHost:
      stationSettings?.station_kv_jpl_host ??
      stationSettings?.station_config_jpl_host,
    environment:
      nodeEnv === 'production'
        ? undefined
        : {
            proxyUrl: process.env.VPOS_PROXY_URL,
            fiscalizationUrl: process.env.VPOS_FISCALIZATION_URL,
            proxyBasePath: process.env.VPOS_PROXY_BASE_PATH,
          },
  })
}

const stripNulls = (value: unknown): unknown => {
  if (value === null || value === undefined) return undefined
  if (Array.isArray(value)) {
    return value.map(stripNulls).filter((entry) => entry !== undefined)
  }
  if (typeof value === 'object') {
    const result: Record<string, unknown> = {}
    for (const [key, entry] of Object.entries(value)) {
      const normalized = stripNulls(entry)
      if (normalized !== undefined) result[key] = normalized
    }
    return result
  }
  return value
}

const readResponseBody = async (response: Response): Promise<unknown> => {
  const text = await response.text()
  if (!text) return null
  try {
    return JSON.parse(text)
  } catch {
    return { message: text }
  }
}

const readProxyFailureMessage = (data: unknown): string | null => {
  if (!data || typeof data !== 'object') return null
  const object = data as Record<string, unknown>
  const nested =
    object.data && typeof object.data === 'object'
      ? (object.data as Record<string, unknown>)
      : null
  const message = String(
    object.message ??
      object.errorMessage ??
      nested?.message ??
      nested?.errorMessage ??
      '',
  ).trim()
  return message || null
}

async function postStockPayload(input: {
  stationId: string
  path: string
  body: unknown
  idempotencyKey: string
}) {
  const target = await resolveStockProxyTarget(input.stationId)
  const candidates = [`${target.basePath}${input.path}`, input.path].filter(
    (value, index, values) => value && values.indexOf(value) === index,
  )

  let lastResult: {
    ok: boolean
    status: number
    data: unknown
    url: string
  } | null = null

  for (const path of candidates) {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 15_000)
    const url = new URL(path, `${target.baseUrl}/`).toString()

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          accept: 'application/json',
          'content-type': 'application/json',
          'x-idempotency-key': input.idempotencyKey,
        },
        body: JSON.stringify(stripNulls(input.body)),
        signal: controller.signal,
      })
      const data = await readResponseBody(response)
      lastResult = { ok: response.ok, status: response.status, data, url }

      if (response.status !== 404 && response.status !== 405) {
        return lastResult
      }
    } catch (error) {
      const message =
        error instanceof Error && error.name === 'AbortError'
          ? 'vpos-proxy stock request timed out.'
          : error instanceof Error
            ? error.message
            : String(error)
      lastResult = {
        ok: false,
        status: error instanceof Error && error.name === 'AbortError' ? 504 : 0,
        data: { message },
        url,
      }
      return lastResult
    } finally {
      clearTimeout(timeout)
    }
  }

  return (
    lastResult ?? {
      ok: false,
      status: 500,
      data: { message: 'vpos-proxy stock request failed.' },
      url: target.baseUrl,
    }
  )
}

export async function sendStockMovementToProxy(
  stationId: string,
  movementId: string,
) {
  const movement = await getStockMovementRepo(stationId, movementId)
  if (!movement) {
    throw new AppError('NOT_FOUND', 'Stock movement was not found.', 404)
  }
  if (!stockMovementRequiresProxy(movement.sourceType)) {
    throw new AppError(
      'CONFLICT',
      'POS transaction stock movements are local-only because invoice submission updates cloud stock.',
      409,
    )
  }

  const source = await getStockMovementPayloadSourceRepo(stationId, movementId)
  if (!source) {
    throw new AppError('NOT_FOUND', 'Stock movement was not found.', 404)
  }

  try {
    const payload = buildStockProxyPayload(source)
    const result = await postStockPayload({
      stationId,
      path: payload.path,
      body: payload.body,
      idempotencyKey: `${stationId}:product-stock:${movementId}`,
    })
    const businessResult = assessStockProxyResponse(
      result.data,
      payload.responseKey,
    )

    if (!result.ok || !businessResult.ok) {
      throw new AppError(
        'INTERNAL_ERROR',
        businessResult.message ??
          readProxyFailureMessage(result.data) ??
          `vpos-proxy stock request failed with status ${result.status}.`,
        502,
        { proxyStatus: result.status, proxyUrl: result.url },
      )
    }

    await updateStockMovementProxyResultRepo({
      stationId,
      movementId,
      status: 'SENT',
      response: result.data,
      error: null,
    })

    return {
      success: true,
      status: result.status,
      data: result.data,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    const details = error instanceof AppError ? error.details : undefined

    await updateStockMovementProxyResultRepo({
      stationId,
      movementId,
      status: 'FAILED',
      response: details ?? { message },
      error: message,
    })

    if (error instanceof AppError) throw error
    throw new AppError('INTERNAL_ERROR', message, 502)
  }
}
