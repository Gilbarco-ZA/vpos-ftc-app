import type { PoolConfig } from 'pg'

import {
  readBooleanEnv,
  readEnvOrDefault,
  readNumberEnv,
  readTrimmedEnv,
} from '@/src/platform/config/env'

export const DEFAULT_PERM_DIR = '/opt/fccapps/vpos-perm/vposftc'
export const DEFAULT_LEGACY_PERM_DIR = '/opt/fccapps/vpos-perm/vposfiscal'
export const DEFAULT_LEGACY_ARCHIVE_DIR = `${DEFAULT_PERM_DIR}/legacy-archive`

const DEFAULT_DATA_ROOT = process.env.PERM_DIR || DEFAULT_PERM_DIR

export const getLegacyPermDir = (): string => {
  return readTrimmedEnv('LEGACY_PERM_DIR') ?? DEFAULT_LEGACY_PERM_DIR
}

export const getLegacyArchiveDir = (): string => {
  const configured = readTrimmedEnv('LEGACY_IMPORT_DIR')
  if (configured) return configured

  const permDir = readTrimmedEnv('PERM_DIR') ?? DEFAULT_PERM_DIR
  return `${permDir.replace(/\/+$/, '')}/legacy-archive`
}

const dedupe = (values: string[]): string[] => {
  return Array.from(new Set(values.filter((value) => value.trim().length > 0)))
}

export const getNodeEnv = (): string => {
  return readEnvOrDefault('NODE_ENV', 'development')
}

export const isProduction = (): boolean => getNodeEnv() === 'production'

export const isDevelopment = (): boolean => getNodeEnv() === 'development'

export const DEFAULT_POSTGRES_DATABASE = 'vpos_ftc'

export const getPostgresDatabaseName = (): string => {
  const connectionString = readTrimmedEnv('POSTGRES_URL')
  if (connectionString) {
    try {
      const pathname = new URL(connectionString).pathname.replace(/^\//, '')
      if (pathname) return decodeURIComponent(pathname)
    } catch {
      // Pool creation will report a malformed connection string with full context.
    }
  }

  return readEnvOrDefault('POSTGRES_DATABASE', DEFAULT_POSTGRES_DATABASE)
}

const boundedIntegerEnv = (
  name: string,
  defaultValue: number,
  min: number,
  max: number,
): number => {
  const value = Math.trunc(readNumberEnv(name, defaultValue))
  return Math.max(min, Math.min(max, value))
}

export const getPostgresPoolConfig = (): PoolConfig => {
  const connectionString = readTrimmedEnv('POSTGRES_URL')

  const common: PoolConfig = {
    // Keep master's proven default capacity, but make it bounded and tunable.
    // The pool itself is process-global so this limit is no longer multiplied
    // by separate Next.js server module graphs.
    max: boundedIntegerEnv('POSTGRES_POOL_MAX', 20, 2, 50),
    idleTimeoutMillis: boundedIntegerEnv(
      'POSTGRES_POOL_IDLE_TIMEOUT_MS',
      30_000,
      1_000,
      300_000,
    ),
    connectionTimeoutMillis: boundedIntegerEnv(
      'POSTGRES_POOL_CONNECTION_TIMEOUT_MS',
      10_000,
      1_000,
      60_000,
    ),
  }

  if (connectionString) {
    return {
      ...common,
      connectionString,
    }
  }

  return {
    ...common,
    host: readEnvOrDefault('POSTGRES_HOST', '127.0.0.1'),
    port: readNumberEnv('POSTGRES_PORT', 5432),
    database: getPostgresDatabaseName(),
    user: readEnvOrDefault('POSTGRES_USER', 'postgres'),
    password: readEnvOrDefault('POSTGRES_PASSWORD', 'postgres'),
  }
}

export const getDataRootCandidates = (): string[] => {
  return dedupe([
    readTrimmedEnv('VPOS_CONFIG_DIR') ?? '',
    readTrimmedEnv('VPOS_DATA_DIR') ?? '',
    readTrimmedEnv('PERM_DIR') ?? '',
    DEFAULT_DATA_ROOT,
  ])
}

export const getPrimaryDataRoot = (): string => {
  return getDataRootCandidates()[0] ?? DEFAULT_DATA_ROOT
}

export const shouldRunProxyWorker = (): boolean => {
  return readBooleanEnv('RUN_PROXY_WORKER', true)
}

export const shouldRunInternalFiscalizationWorkers = (): boolean => {
  // Production route selection is station-scoped in the database. Keep the
  // internal workers available so Tanzania sites can switch between local TZ
  // and proxy/cloud without needing shipped environment changes.
  return !readBooleanEnv('VPOS_DISABLE_INTERNAL_FISCALIZATION_WORKERS', false)
}

export const getSessionCookieName = (): string => 'tin_capture_session'
