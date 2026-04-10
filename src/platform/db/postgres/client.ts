import type { Pool, PoolClient } from 'pg'

import {
  checkHealth,
  closePool,
  getPool,
} from '@/src/platform/db/postgres/core'

export type { Pool, PoolClient } from 'pg'

export { checkHealth, closePool, getPool }

export async function getClient(): Promise<PoolClient> {
  return await getPool().connect()
}
