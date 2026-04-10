import type { ConnectionPool, IResult, Transaction } from 'mssql'

import {
  getPool as platformGetPool,
  query as platformQuery,
  queryAll as platformQueryAll,
  queryOne as platformQueryOne,
  withTransaction as platformWithTransaction,
} from '@/src/platform/db/azure-sql'

/**
 * Shared DB exposes a stable Azure SQL facade for modules.
 * Connection management remains platform-owned infrastructure.
 */
export type TransactionCallback<T> = (transaction: Transaction) => Promise<T>

export const getPool = async (): Promise<ConnectionPool> => {
  return await platformGetPool()
}

export const query = async <T = Record<string, unknown>>(
  text: string,
  params?: Record<string, unknown>,
): Promise<IResult<T>> => {
  return await platformQuery<T>(text, params)
}

export const queryOne = async <T = Record<string, unknown>>(
  text: string,
  params?: Record<string, unknown>,
): Promise<T | null> => {
  return await platformQueryOne<T>(text, params)
}

export const queryAll = async <T = Record<string, unknown>>(
  text: string,
  params?: Record<string, unknown>,
): Promise<T[]> => {
  return await platformQueryAll<T>(text, params)
}

export const withTransaction = async <T>(
  callback: TransactionCallback<T>,
): Promise<T> => {
  return await platformWithTransaction<T>(callback)
}
