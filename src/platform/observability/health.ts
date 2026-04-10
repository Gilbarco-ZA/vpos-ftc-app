import net from 'net'

import { shouldRunProxyWorker } from '@/src/platform/config/app-config'
import { queryAll, queryOne } from '@/src/platform/db/postgres'
import { jplHealth } from '@/src/platform/integrations/jpl/client'
import { getJplConfig } from '@/src/platform/integrations/jpl/config'
import { ligoHealth } from '@/src/platform/integrations/ligo/client'
import { getLigoConfig } from '@/src/platform/integrations/ligo/config'
import { namosHealth } from '@/src/platform/integrations/namos/client'
import { getNamosConfig } from '@/src/platform/integrations/namos/config'
import { ppxHealth } from '@/src/platform/integrations/ppx/client'
import { getPpxConfig } from '@/src/platform/integrations/ppx/config'
import { getEnvValue } from '@/src/shared/config/envDb'
import { getStationSettings } from '@/src/shared/config/stationSettings'
import { safeAsync } from '@/src/shared/utils/safeAsync'

const DEFAULT_HEARTBEAT_MAX_AGE_MS = 20_000

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  if (!raw) return fallback
  const normalized = raw.replace(/_/g, '').trim()
  if (!normalized) return fallback
  const parsed = Number(normalized)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

const HEARTBEAT_MAX_AGE_MS = parsePositiveInt(
  process.env.VPOS_READY_HEARTBEAT_MAX_AGE_MS,
  DEFAULT_HEARTBEAT_MAX_AGE_MS,
)

async function checkDb() {
  const rows = await queryAll<{ ok: boolean }>('SELECT true as ok', [])
  return { ok: !!rows?.[0]?.ok }
}

async function checkJpl(stationId: string) {
  const config = await getJplConfig(stationId)
  if (!config) return { configured: false, ok: true }
  const result = await jplHealth(stationId)
  return { configured: true, ok: !!result?.ok, data: result ?? null }
}

async function checkLigo(stationId: string) {
  const config = await getLigoConfig(stationId)
  if (!config) return { configured: false, ok: true }
  const result = await ligoHealth(stationId)
  return { configured: true, ok: !!result?.ok, data: result ?? null }
}

async function checkNamos(stationId: string) {
  const config = await getNamosConfig(stationId)
  if (!config) return { configured: false, ok: true }
  const result = await namosHealth(stationId)
  return { configured: true, ok: !!result?.ok, data: result ?? null }
}

async function checkPpx(stationId: string) {
  const config = await getPpxConfig(stationId)
  if (!config) return { configured: false, ok: true }
  const result = await ppxHealth(stationId)
  return { configured: true, ok: !!result?.ok, data: result ?? null }
}

async function resolveProxyBase(stationId: string) {
  const settings = await safeAsync(
    getStationSettings(stationId),
    'health.resolveProxyBase',
  )
  const url =
    (settings?.proxy_url ? String(settings.proxy_url) : '') ||
    (await getEnvValue(stationId, 'VPOS_PROXY_URL', 'http://127.0.0.1:5555')) ||
    (await getEnvValue(stationId, 'VPOS_FISCALIZATION_URL')) ||
    ''
  const basePath =
    (settings?.proxy_base_path ? String(settings.proxy_base_path) : '') ||
    (await getEnvValue(stationId, 'VPOS_PROXY_BASE_PATH', '/')) ||
    '/'

  const base = String(url).trim().replace(/\/+$/, '')
  const path = String(basePath).trim().replace(/\/+$/, '')
  return { base, path }
}

async function checkProxyFiscalization(stationId: string) {
  const { base, path } = await resolveProxyBase(stationId)
  if (!base) return { configured: false, ok: true }
  const url = `${base}${path}/health`
  try {
    const response = await fetch(url, { method: 'GET' })
    return { configured: true, ok: response.ok, status: response.status }
  } catch (error: any) {
    return {
      configured: true,
      ok: false,
      error: String(error?.message || error),
    }
  }
}

async function checkPrinter(stationId: string) {
  const row = await queryOne<any>(
    `SELECT config_json
     FROM device_configs
     WHERE station_id = $1 AND device_type = 'printer' AND enabled = TRUE
     ORDER BY (device_key = 'default') DESC, updated_at DESC
     LIMIT 1`,
    [stationId],
  )
  if (!row) return { configured: false, ok: true }

  const config = row.config_json || {}
  const ip = String(
    config.printerIP || config.printerIp || config.ip || '',
  ).trim()
  const port = config.port ? Number(config.port) : 9100
  if (!ip) return { configured: false, ok: true }

  const timeoutMs = Number(process.env.VPOS_PRINTER_READY_TIMEOUT_MS ?? '1500')
  const ok = await new Promise<boolean>((resolve) => {
    const socket = net.createConnection({ host: ip, port }, () => {
      socket.end()
      resolve(true)
    })
    socket.setTimeout(timeoutMs)
    socket.on('timeout', () => {
      socket.destroy()
      resolve(false)
    })
    socket.on('error', () => resolve(false))
  })

  return { configured: true, ok, ip, port }
}

async function checkArchiveExporters(_stationId: string) {
  return { configured: false, ok: true, destinations: [] as any[] }
}

async function checkWorkers(stationId: string) {
  const required = [
    'posCommandsWorker',
    'printJobsWorker',
    'reportQueueWorker',
    'transactionFiscalizationScheduler',
    'transactionQueueWorker',
    'supervisorMonitorWorker',
  ]

  if (shouldRunProxyWorker()) {
    required.push('proxySenderWorker')
  }

  const rows = await queryAll<any>(
    `SELECT process_name, last_heartbeat_at
     FROM process_heartbeats
     WHERE station_id = $1 AND process_name = ANY($2::text[])`,
    [stationId, required],
  ).catch(() => [])

  const now = Date.now()
  const byName = new Map<string, any>()
  for (const row of rows) byName.set(String(row.process_name), row)

  const missing: string[] = []
  const stale: { processName: string; ageMs: number }[] = []

  for (const name of required) {
    const row = byName.get(name)
    if (!row) {
      missing.push(name)
      continue
    }
    const heartbeatAt = new Date(row.last_heartbeat_at).getTime()
    const ageMs = now - heartbeatAt
    if (!Number.isFinite(ageMs) || ageMs > HEARTBEAT_MAX_AGE_MS) {
      stale.push({ processName: name, ageMs })
    }
  }

  return {
    configured: true,
    ok: missing.length === 0 && stale.length === 0,
    required,
    missing,
    stale,
    maxAgeMs: HEARTBEAT_MAX_AGE_MS,
  }
}

export async function getHealth(stationId: string) {
  const [db, jpl, ligo, namos, ppx, proxy, exporters, printer, workers] =
    await Promise.all([
      checkDb(),
      checkJpl(stationId),
      checkLigo(stationId),
      checkNamos(stationId),
      checkPpx(stationId),
      checkProxyFiscalization(stationId),
      checkArchiveExporters(stationId),
      checkPrinter(stationId),
      checkWorkers(stationId),
    ])

  const ok =
    db.ok &&
    jpl.ok &&
    ligo.ok &&
    namos.ok &&
    ppx.ok &&
    proxy.ok &&
    exporters.ok &&
    printer.ok &&
    workers.ok

  return {
    ok,
    components: {
      db,
      jpl,
      ligo,
      namos,
      ppx,
      proxyFiscalization: proxy,
      archiveExporters: exporters,
      printer,
      workers,
    },
  }
}

export async function getReadiness(stationId: string) {
  return await getHealth(stationId)
}
