import { readFileSync } from 'node:fs'
import type { ForecourtRuntimeConfig } from '@/src/modules/forecourt/infrastructure/runtimeConfig'

export type JplTlsMaterialSummary = {
  enabled: boolean
  rejectUnauthorized: boolean
  servername?: string
  minVersion: 'TLSv1.2' | 'TLSv1.3'
  caConfigured: boolean
  clientCertificateConfigured: boolean
}

type JplTlsClientOptions = {
  enabled: true
  rejectUnauthorized: boolean
  servername?: string
  ca?: Buffer
  cert?: Buffer
  key?: Buffer
  minVersion: 'TLSv1.2' | 'TLSv1.3'
}

const readPem = (path: string | undefined, label: string) => {
  const normalized = String(path ?? '').trim()
  if (!normalized) return undefined

  try {
    return readFileSync(normalized)
  } catch (error) {
    throw new Error(
      `Unable to read ${label} PEM file at "${normalized}": ${error instanceof Error ? error.message : String(error)}`,
    )
  }
}

export const buildJplTlsClientOptions = (
  cfg: ForecourtRuntimeConfig,
): JplTlsClientOptions | undefined => {
  const enabled = Boolean(cfg.jplTlsRequired) || Number(cfg.jplPort) === 8889
  if (!enabled) return undefined

  const cert = readPem(cfg.jplTlsClientCertPath, 'JPL client certificate')
  const key = readPem(cfg.jplTlsClientKeyPath, 'JPL client private key')

  if (Boolean(cert) !== Boolean(key)) {
    throw new Error(
      'JPL mutual TLS configuration requires both JPL_TLS_CLIENT_CERT_PATH and JPL_TLS_CLIENT_KEY_PATH',
    )
  }

  return {
    enabled: true,
    rejectUnauthorized: cfg.jplTlsRejectUnauthorized !== false,
    servername: String(cfg.jplTlsServername ?? '').trim() || undefined,
    ca: readPem(cfg.jplTlsCaPath, 'JPL CA certificate'),
    cert,
    key,
    minVersion: cfg.jplTlsMinVersion === 'TLSv1.3' ? 'TLSv1.3' : 'TLSv1.2',
  }
}

export const summarizeJplTlsConfig = (
  cfg: ForecourtRuntimeConfig,
): JplTlsMaterialSummary => ({
  enabled: Boolean(cfg.jplTlsRequired) || Number(cfg.jplPort) === 8889,
  rejectUnauthorized: cfg.jplTlsRejectUnauthorized !== false,
  servername: String(cfg.jplTlsServername ?? '').trim() || undefined,
  minVersion: cfg.jplTlsMinVersion === 'TLSv1.3' ? 'TLSv1.3' : 'TLSv1.2',
  caConfigured: Boolean(String(cfg.jplTlsCaPath ?? '').trim()),
  clientCertificateConfigured: Boolean(
    String(cfg.jplTlsClientCertPath ?? '').trim() &&
    String(cfg.jplTlsClientKeyPath ?? '').trim(),
  ),
})
