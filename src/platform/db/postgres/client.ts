import type { PoolClient } from 'pg'

import {
  checkHealth,
  closePool,
  getPool,
  getPostgresPoolDiagnostics,
} from '@/src/platform/db/postgres/core'

export type { Pool, PoolClient } from 'pg'

export { checkHealth, closePool, getPool, getPostgresPoolDiagnostics }

export async function getClient(): Promise<PoolClient> {
  return await getPool().connect()
}
