import sql, { ConnectionPool, IResult, Transaction } from 'mssql'

import { logger } from '@/src/shared/utils/logger'

let pool: ConnectionPool | null = null

const config: sql.config = {
  server: process.env.AZURE_SQL_SERVER || '',
  database: process.env.AZURE_SQL_DATABASE || '',
  user: process.env.AZURE_SQL_USER || '',
  password: process.env.AZURE_SQL_PASSWORD || '',
  port: parseInt(process.env.AZURE_SQL_PORT || '1433'),
  options: {
    encrypt: true,
    trustServerCertificate: false,
    enableArithAbort: true,
  },
  pool: {
    max: 10,
    min: 0,
    idleTimeoutMillis: 30000,
  },
}

/**
 * Platform owns Azure SQL connectivity because it is infrastructure-heavy.
 * Shared DB exposes a stable facade for modules that need cross-cutting access.
 */
export const getPool = async (): Promise<ConnectionPool> => {
  if (!pool) {
    pool = await sql.connect(config)
    pool.on('error', (err: any) => {
      logger.error('[azure-sql]', { msg: 'pool error', error: err })
      pool = null
    })
  }
  return pool
}

export const query = async <T = Record<string, unknown>>(
  text: string,
  params?: Record<string, unknown>,
): Promise<IResult<T>> => {
  const currentPool = await getPool()
  const request = currentPool.request()
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      request.input(key, value)
    }
  }
  const start = Date.now()
  const result = await request.query<T>(text)
  const duration = Date.now() - start
  if (process.env.NODE_ENV === 'development' && duration > 100) {
    logger.debug('[azure-sql]', {
      msg: 'Slow query',
      text,
      duration,
      rows: result.recordset?.length,
    })
  }
  return result
}

export const queryOne = async <T = Record<string, unknown>>(
  text: string,
  params?: Record<string, unknown>,
): Promise<T | null> => {
  const result = await query<T>(text, params)
  return result.recordset[0] || null
}

export const queryAll = async <T = Record<string, unknown>>(
  text: string,
  params?: Record<string, unknown>,
): Promise<T[]> => {
  const result = await query<T>(text, params)
  return result.recordset
}

export type TransactionCallback<T> = (transaction: Transaction) => Promise<T>

export const withTransaction = async <T>(
  callback: TransactionCallback<T>,
): Promise<T> => {
  const currentPool = await getPool()
  const transaction = new sql.Transaction(currentPool)
  try {
    await transaction.begin()
    const result = await callback(transaction)
    await transaction.commit()
    return result
  } catch (error) {
    await transaction.rollback()
    throw error
  }
}
