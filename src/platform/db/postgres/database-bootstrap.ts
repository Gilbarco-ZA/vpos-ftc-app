import type { ClientConfig, PoolConfig } from 'pg'
import { Client } from 'pg'

import {
  getPostgresDatabaseName,
  getPostgresPoolConfig,
} from '@/src/platform/config/app-config'
import { logger } from '@/src/shared/utils/logger'

let databaseBootstrapPromise: Promise<void> | null = null

const quoteIdentifier = (value: string): string => {
  return `"${value.replace(/"/g, '""')}"`
}

const buildAdminConfig = (target: PoolConfig): ClientConfig => {
  if (target.connectionString) {
    const url = new URL(target.connectionString)
    url.pathname = '/postgres'
    return {
      connectionString: url.toString(),
      connectionTimeoutMillis: target.connectionTimeoutMillis,
    }
  }

  return {
    host: target.host,
    port: target.port,
    user: target.user,
    password: target.password,
    database: 'postgres',
    ssl: target.ssl,
    connectionTimeoutMillis: target.connectionTimeoutMillis,
  }
}

const databaseExists = async (
  client: Client,
  databaseName: string,
): Promise<boolean> => {
  const result = await client.query(
    'SELECT 1 FROM pg_database WHERE datname = $1 LIMIT 1',
    [databaseName],
  )
  return result.rowCount === 1
}

const createDatabaseIfMissing = async (): Promise<void> => {
  const databaseName = getPostgresDatabaseName()
  const targetConfig = getPostgresPoolConfig()
  const admin = new Client(buildAdminConfig(targetConfig))

  await admin.connect()
  try {
    if (await databaseExists(admin, databaseName)) return

    try {
      await admin.query(`CREATE DATABASE ${quoteIdentifier(databaseName)}`)
      logger.info('[postgres]', {
        msg: 'Created application database',
        database: databaseName,
      })
    } catch (error: any) {
      // Another app instance may have created it between the existence check
      // and CREATE DATABASE. PostgreSQL reports duplicate_database as 42P04.
      if (error?.code !== '42P04') throw error
    }
  } finally {
    await admin.end().catch(() => undefined)
  }
}

export const ensurePostgresDatabase = async (): Promise<void> => {
  if (!databaseBootstrapPromise) {
    databaseBootstrapPromise = createDatabaseIfMissing().catch((error) => {
      databaseBootstrapPromise = null
      throw error
    })
  }
  return databaseBootstrapPromise
}
