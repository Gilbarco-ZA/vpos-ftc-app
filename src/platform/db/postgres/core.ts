import { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg'

import { getPostgresPoolConfig } from '@/src/platform/config/app-config'
import { logDbQuery } from '@/src/platform/db/observability/dbDebug'
import { logSlowQuery } from '@/src/platform/db/observability/slow-query-logger'
import { logger } from '@/src/shared/utils/logger'
import { serializeError } from '@/src/shared/utils/serializeError'

type PostgresPoolGlobals = typeof globalThis & {
  __vposPostgresPool?: Pool
  __vposPostgresPoolCreatedAt?: number
}

export type PostgresPoolDiagnostics = {
  pid: number
  totalCount: number
  idleCount: number
  waitingCount: number
  max: number
  idleTimeoutMillis: number
  connectionTimeoutMillis: number
  createdAt: string | null
}

const poolGlobals = () => globalThis as PostgresPoolGlobals

const getConfiguredPoolLimits = () => {
  const config = getPostgresPoolConfig()
  return {
    max: Number(config.max ?? 20),
    idleTimeoutMillis: Number(config.idleTimeoutMillis ?? 30_000),
    connectionTimeoutMillis: Number(config.connectionTimeoutMillis ?? 10_000),
  }
}

const isPoolPressureError = (error: unknown) => {
  const message = error instanceof Error ? error.message : String(error ?? '')
  return /timeout expired|connection terminated due to connection timeout|remaining connection slots|too many clients/i.test(
    message,
  )
}

export type TransactionCallback<T> = (client: PoolClient) => Promise<T>

export interface PaginationParams {
  page?: number
  pageSize?: number
}

export interface PaginatedResult<T> {
  data: T[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

export const getPool = (): Pool => {
  const globals = poolGlobals()
  if (!globals.__vposPostgresPool) {
    const config = getPostgresPoolConfig()
    const pool = new Pool(config)
    globals.__vposPostgresPool = pool
    globals.__vposPostgresPoolCreatedAt = Date.now()

    pool.on('error', (err: any) => {
      logger.error('[postgres]', {
        msg: 'Unexpected error on idle client',
        error: serializeError(err),
        pool: getPostgresPoolDiagnostics(),
      })
    })

    logger.info('[postgres] pool created', {
      pid: process.pid,
      max: config.max ?? null,
      idleTimeoutMillis: config.idleTimeoutMillis ?? null,
      connectionTimeoutMillis: config.connectionTimeoutMillis ?? null,
    })
  }
  return globals.__vposPostgresPool!
}

/**
 * The pool is process-global rather than module-global. Next.js may load
 * server modules through more than one compiled graph in a single Node.js
 * process; a module-local singleton can therefore create duplicate pg pools.
 */
export const getPostgresPoolDiagnostics = (): PostgresPoolDiagnostics => {
  const globals = poolGlobals()
  const activePool = globals.__vposPostgresPool
  const limits = getConfiguredPoolLimits()

  return {
    pid: process.pid,
    totalCount: activePool?.totalCount ?? 0,
    idleCount: activePool?.idleCount ?? 0,
    waitingCount: activePool?.waitingCount ?? 0,
    max: limits.max,
    idleTimeoutMillis: limits.idleTimeoutMillis,
    connectionTimeoutMillis: limits.connectionTimeoutMillis,
    createdAt: globals.__vposPostgresPoolCreatedAt
      ? new Date(globals.__vposPostgresPoolCreatedAt).toISOString()
      : null,
  }
}

export const query = async <T extends QueryResultRow = Record<string, unknown>>(
  text: string,
  params?: unknown[],
): Promise<QueryResult<T>> => {
  return executeQuery<T>(
    (activePool, sql, values) => activePool.query<T>(sql, values),
    text,
    params,
  )
}

export const queryUnobserved = async <
  T extends QueryResultRow = Record<string, unknown>,
>(
  text: string,
  params?: unknown[],
): Promise<QueryResult<T>> => {
  return executeQuery<T>(
    (activePool, sql, values) => activePool.query<T>(sql, values),
    text,
    params,
    { observe: false },
  )
}

async function executeQuery<T extends QueryResultRow>(
  runner: (
    pool: Pool,
    text: string,
    params?: unknown[],
  ) => Promise<QueryResult<T>>,
  text: string,
  params?: unknown[],
  options?: { observe?: boolean },
): Promise<QueryResult<T>> {
  const activePool = getPool()
  const start = Date.now()
  const observe = options?.observe !== false

  try {
    const result = await runner(activePool, text, params)
    const duration = Date.now() - start

    if (observe) {
      logDbQuery({
        adapter: 'postgres',
        text,
        durationMs: duration,
        rowCount: result.rowCount,
        values: params,
        rowsPreview: result.rows as unknown as unknown[],
      })
      logSlowQuery({
        adapter: 'postgres',
        text,
        params,
        durationMs: duration,
        rowCount: result.rowCount,
      })
    }

    return result
  } catch (err) {
    const duration = Date.now() - start
    if (observe) {
      logDbQuery({
        adapter: 'postgres',
        text,
        durationMs: duration,
        rowCount: null,
        queryError: err,
        values: params,
      })
      logSlowQuery({
        adapter: 'postgres',
        text,
        params,
        durationMs: duration,
        rowCount: null,
        queryError: err,
      })
    }
    if (isPoolPressureError(err)) {
      logger.error('[postgres] pool pressure query failure', {
        durationMs: duration,
        error: serializeError(err),
        pool: getPostgresPoolDiagnostics(),
      })
    }
    throw err
  }
}

export const queryOne = async <
  T extends QueryResultRow = Record<string, unknown>,
>(
  text: string,
  params?: unknown[],
): Promise<T | null> => {
  const result = await query<T>(text, params)
  return result.rows[0] || null
}

export const queryAll = async <
  T extends QueryResultRow = Record<string, unknown>,
>(
  text: string,
  params?: unknown[],
): Promise<T[]> => {
  const result = await query<T>(text, params)
  return result.rows
}

export const withTransaction = async <T>(
  callback: TransactionCallback<T>,
): Promise<T> => {
  const activePool = getPool()
  const client = await activePool.connect()

  try {
    await client.query('BEGIN')
    const result = await callback(client)
    await client.query('COMMIT')
    return result
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}

export const txQuery = async <
  T extends QueryResultRow = Record<string, unknown>,
>(
  client: PoolClient,
  text: string,
  params?: unknown[],
): Promise<QueryResult<T>> => {
  const start = Date.now()
  try {
    const result = await client.query<T>(text, params)
    const duration = Date.now() - start

    logDbQuery({
      adapter: 'postgres',
      text,
      durationMs: duration,
      rowCount: result.rowCount,
      values: params,
      rowsPreview: result.rows as unknown as unknown[],
    })
    logSlowQuery({
      adapter: 'postgres',
      text,
      params,
      durationMs: duration,
      rowCount: result.rowCount,
      inTransaction: true,
    })

    return result
  } catch (err) {
    const duration = Date.now() - start
    logDbQuery({
      adapter: 'postgres',
      text,
      durationMs: duration,
      rowCount: null,
      queryError: err,
      values: params,
    })
    logSlowQuery({
      adapter: 'postgres',
      text,
      params,
      durationMs: duration,
      rowCount: null,
      inTransaction: true,
      queryError: err,
    })
    throw err
  }
}

export const toCamelCase = <T>(row: Record<string, unknown>): T => {
  const result: Record<string, unknown> = {}

  for (const [key, value] of Object.entries(row)) {
    const camelKey = key.replace(/_([a-z])/g, (_, letter) =>
      letter.toUpperCase(),
    )
    result[camelKey] = value
  }

  return result as T
}

export const toSnakeCase = (
  obj: Record<string, unknown>,
): Record<string, unknown> => {
  const result: Record<string, unknown> = {}

  for (const [key, value] of Object.entries(obj)) {
    const snakeKey = key.replace(
      /[A-Z]/g,
      (letter) => `_${letter.toLowerCase()}`,
    )
    result[snakeKey] = value
  }

  return result
}

export const mapRows = <T>(rows: Record<string, unknown>[]): T[] => {
  return rows.map((row) => toCamelCase<T>(row))
}

export const queryPaginated = async <
  T extends QueryResultRow = Record<string, unknown>,
>(
  baseQuery: string,
  countQuery: string,
  params: unknown[],
  pagination: PaginationParams,
): Promise<PaginatedResult<T>> => {
  const page = Math.max(1, pagination.page || 1)
  const pageSize = Math.min(100, Math.max(1, pagination.pageSize || 20))
  const offset = (page - 1) * pageSize

  const countResult = await query<{ count: string }>(countQuery, params)
  const total = parseInt(countResult.rows[0]?.count || '0', 10)

  const dataQuery = `${baseQuery} LIMIT $${params.length + 1} OFFSET $${params.length + 2}`
  const dataResult = await query<T>(dataQuery, [...params, pageSize, offset])

  return {
    data: mapRows<T>(dataResult.rows as unknown as Record<string, unknown>[]),
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  }
}

export const closePool = async (): Promise<void> => {
  const globals = poolGlobals()
  const activePool = globals.__vposPostgresPool
  if (!activePool) return

  globals.__vposPostgresPool = undefined
  globals.__vposPostgresPoolCreatedAt = undefined
  await activePool.end()
}

export const checkHealth = async (): Promise<boolean> => {
  try {
    const result = await query('SELECT 1 as ok')
    return result.rows[0]?.ok === 1
  } catch {
    return false
  }
}

export const db = {
  query: queryAll,
  queryOne,
  queryRaw: query,
  withTransaction,
}
