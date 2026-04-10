import type { PoolConfig } from 'pg'

import {
  readBooleanEnv,
  readEnvOrDefault,
  readNumberEnv,
  readTrimmedEnv,
} from '@/src/platform/config/env'

const DEFAULT_DATA_ROOT =
  process.env.PERM_DIR || '/opt/fccapps/vpos-perm/vposftc'

const dedupe = (values: string[]): string[] => {
  return Array.from(new Set(values.filter((value) => value.trim().length > 0)))
}

export const getNodeEnv = (): string => {
  return readEnvOrDefault('NODE_ENV', 'development')
}

export const isProduction = (): boolean => getNodeEnv() === 'production'

export const isDevelopment = (): boolean => getNodeEnv() === 'development'

export const getPostgresPoolConfig = (): PoolConfig => {
  const connectionString = readTrimmedEnv('POSTGRES_URL')

  const common: PoolConfig = {
    max: 20,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
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
    database: readEnvOrDefault('POSTGRES_DATABASE', 'postgres'),
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
  if (readBooleanEnv('VPOS_ALLOW_INTERNAL_FISCALIZATION', false)) {
    return true
  }

  const flow = readEnvOrDefault(
    'VPOS_FISCAL_FLOW',
    shouldRunProxyWorker() ? 'proxy' : 'internal',
  )
    .trim()
    .toLowerCase()

  if (flow === 'proxy') {
    return false
  }

  return !shouldRunProxyWorker()
}

export const getSessionCookieName = (): string => 'tin_capture_session'
