/*
 * Single-process runtime entrypoint.
 *
 * Startup order:
 *  1. Run the minimum database/bootstrap migrations.
 *  2. Bind HTTP and expose /api/livez immediately.
 *  3. Prepare Next.js and make the UI available.
 *  4. Import legacy data with visible progress.
 *  5. Start forecourt configuration and background workers.
 */

import fs from 'fs'
import http from 'http'
import https from 'https'
import next from 'next'

import { createDomsProcessGuard } from '@/src/platform/bootstrap/doms-process-guard'
import { importLegacyIfPresent } from '@/src/platform/bootstrap/legacy-importer'
import { ensureBootstrapReady } from '@/src/platform/bootstrap/runtime'
import {
  getStartupStatus,
  updateStartupStatus,
} from '@/src/platform/bootstrap/startup-status'
import {
  getLegacyArchiveDir,
  getLegacyPermDir,
} from '@/src/platform/config/app-config'
import { getPostgresPoolDiagnostics } from '@/src/platform/db/postgres'
import {
  installConsoleCapture,
  updateConsoleCaptureStation,
} from '@/src/platform/logs/consoleCapture'
import {
  bootstrapRuntimeEnvironment,
  startLocalServerRuntime,
} from '@/src/platform/runtime'
import { getStationId } from '@/src/shared/utils/getStationId'
import { logger } from '@/src/shared/utils/logger'
import { serializeError } from '@/src/shared/utils/serializeError'

import { getJplTcpAdapterStateSummary } from '@/src/modules/forecourt/application/forecourtAdapters'
import {
  loadForecourtRuntimeConfigFromDb,
  startForecourtRuntimeConfigWatcher,
} from '@/src/modules/forecourt/application/forecourtRuntime'
import { getJplEventProcessingQueueDiagnostics } from '@/src/modules/forecourt/infrastructure/jpl/events'
import { getJplPersistenceQueueDiagnostics } from '@/src/modules/forecourt/infrastructure/jpl/persistence'
import { getForecourtMaterializationQueueDiagnostics } from '@/src/modules/forecourt/infrastructure/persistence'

import { attachForecourtWs } from './server/forecourtWs'

bootstrapRuntimeEnvironment()

let releaseProcessLock: (() => void) | null = null

async function runStartupImport(stationId: string) {
  const legacyPermDir = getLegacyPermDir()
  const moveAsideRoot = getLegacyArchiveDir()

  updateStartupStatus({
    phase: 'importing',
    message: 'Checking for legacy station files',
    detail: null,
    progress: 50,
  })
  try {
    const res = await importLegacyIfPresent({
      stationId,
      legacyPermDir,
      moveAsideRoot: moveAsideRoot || undefined,
      sourceType: 'vpos-console',
      onProgress: ({ message, progress, detail }) =>
        updateStartupStatus({
          phase: 'importing',
          message,
          progress,
          detail: detail ?? null,
        }),
    })
    if (res) {
      logger.info(
        `[startup-import] done. inserted=${JSON.stringify(res.inserted)} moved=${JSON.stringify(res.moved)} warnings=${res.warnings.length}`,
      )
      if (res.warnings.length) {
        logger.info('[startup-import] import warnings recorded', {
          count: res.warnings.length,
          warnings: res.warnings.slice(0, 20),
          truncated: res.warnings.length > 20,
        })
      }
      updateStartupStatus({
        phase: 'forecourt-starting',
        message: 'Legacy import completed',
        detail: res.warnings.length
          ? `${res.warnings.length} import warning(s) recorded`
          : null,
        progress: 88,
        importResult: {
          inserted: res.inserted,
          skipped: res.skipped,
          moved: res.moved,
          warnings: res.warnings.length,
        },
      })
    } else {
      logger.info('[startup-import] nothing to import')
      updateStartupStatus({
        phase: 'forecourt-starting',
        message: 'No legacy files require importing',
        detail: null,
        progress: 88,
      })
    }
  } catch (e: any) {
    logger.error('[startup-import] failed:', { error: serializeError(e) })
    updateStartupStatus({
      phase: 'forecourt-starting',
      message: 'Legacy import completed with errors',
      detail: e?.message || String(e),
      progress: 88,
    })
  }
}

function maybeHttpsServer(handler: http.RequestListener) {
  const useHttps =
    String(process.env.VPOS_USE_HTTPS || '0').toLowerCase() === '1'
  if (!useHttps) return http.createServer(handler)

  const keyPath = process.env.VPOS_HTTPS_KEY_PATH?.trim()
  const certPath = process.env.VPOS_HTTPS_CERT_PATH?.trim()

  if (!keyPath || !certPath) {
    throw new Error(
      'VPOS_USE_HTTPS=1 requires VPOS_HTTPS_KEY_PATH and VPOS_HTTPS_CERT_PATH',
    )
  }

  return https.createServer(
    { key: fs.readFileSync(keyPath), cert: fs.readFileSync(certPath) },
    handler,
  )
}

function sendJson(res: http.ServerResponse, statusCode: number, body: unknown) {
  res.statusCode = statusCode
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.setHeader('cache-control', 'no-store')
  res.end(JSON.stringify(body))
}

async function main() {
  const processGuard = createDomsProcessGuard('vpos-ftc-app')
  processGuard.acquireOrHandleCommand()
  releaseProcessLock = processGuard.release

  const dev = process.env.NODE_ENV !== 'production'
  let stationId = getStationId()
  installConsoleCapture(stationId)
  const port = Number(process.env.PORT ?? 3080)
  const hostname = process.env.HOST || '0.0.0.0'
  if (!Number.isFinite(port) || port <= 0)
    throw new Error(`Invalid PORT value: ${String(port)}`)

  logger.info(
    `[server] booting. dev=${dev} pid=${process.pid} stationId=${stationId}`,
  )
  updateStartupStatus({
    phase: 'bootstrapping',
    message: 'Applying database migrations',
    progress: 10,
  })
  const boot = await ensureBootstrapReady(stationId)
  if (boot.stationId && boot.stationId !== stationId) {
    stationId = boot.stationId
    updateConsoleCaptureStation(stationId)
  }

  updateStartupStatus({
    phase: 'http-starting',
    message: 'Starting web application',
    progress: 25,
  })
  let nextHandler: http.RequestListener | null = null
  const server = maybeHttpsServer((req, res) => {
    const pathname = (req.url || '').split('?', 1)[0]
    if (pathname === '/api/livez')
      return sendJson(res, 200, { ok: true, success: true, status: 'running' })
    if (pathname === '/api/startup/status')
      return sendJson(res, 200, { ok: true, data: getStartupStatus() })
    if (!nextHandler)
      return sendJson(res, 503, {
        ok: false,
        status: 'starting',
        data: getStartupStatus(),
      })
    return nextHandler(req, res)
  })

  server.on('error', (err: any) => {
    logger.error('[server] listen error:', { error: serializeError(err) })
    releaseProcessLock?.()
    process.exit(1)
  })

  await new Promise<void>((resolve) => server.listen(port, hostname, resolve))
  logger.info(`[server] listening on ${hostname}:${port}`)

  const app = next({ dev, hostname, port })
  await app.prepare()
  nextHandler = app.getRequestHandler()
  updateStartupStatus({
    phase: 'importing',
    message: 'Web application started; preparing station data',
    progress: 40,
  })

  let runtime: ReturnType<typeof startLocalServerRuntime> | null = null
  let stopForecourtConfigWatcher: (() => void) | null = null
  const configuredRuntimeDiagnosticsMs = Number(
    process.env.VPOS_RUNTIME_DIAGNOSTICS_MS,
  )
  const runtimeDiagnosticsMs = Math.max(
    10_000,
    Math.min(
      5 * 60_000,
      Number.isFinite(configuredRuntimeDiagnosticsMs)
        ? configuredRuntimeDiagnosticsMs
        : 30_000,
    ),
  )
  const runtimeDiagnosticTimer = setInterval(() => {
    const memory = process.memoryUsage()
    logger.info('[diag] runtime health', {
      pid: process.pid,
      uptimeSeconds: Math.round(process.uptime()),
      memoryMb: {
        rss: Math.round(memory.rss / (1024 * 1024)),
        heapUsed: Math.round(memory.heapUsed / (1024 * 1024)),
        heapTotal: Math.round(memory.heapTotal / (1024 * 1024)),
      },
      postgres: getPostgresPoolDiagnostics(),
      jplPersistence: getJplPersistenceQueueDiagnostics(),
      jplEventProcessing: getJplEventProcessingQueueDiagnostics(),
      forecourtMaterialization: getForecourtMaterializationQueueDiagnostics(),
    })
  }, runtimeDiagnosticsMs)
  runtimeDiagnosticTimer.unref?.()

  void (async () => {
    // Legacy import is intentionally exclusive. Do not attach the forecourt
    // WebSocket layer or start any runtime service before this promise settles,
    // because those paths initialize the JPL adapter.
    await runStartupImport(stationId)

    updateStartupStatus({
      phase: 'forecourt-starting',
      message: 'Starting forecourt services',
      progress: 90,
    })
    attachForecourtWs(server)

    updateStartupStatus({
      phase: 'forecourt-starting',
      message: 'Loading forecourt configuration',
      progress: 92,
    })
    await loadForecourtRuntimeConfigFromDb(stationId).catch((e) =>
      logger.error('[forecourt] failed to load runtime config from DB', {
        error: serializeError(e),
      }),
    )
    stopForecourtConfigWatcher = startForecourtRuntimeConfigWatcher(stationId)
    runtime = startLocalServerRuntime(stationId)
    updateStartupStatus({
      phase: 'ready',
      message: 'Application is ready',
      detail: null,
      progress: 100,
      completedAt: new Date().toISOString(),
    })
    setTimeout(
      () =>
        logger.info('[FORECOURT] JPL TCP adapter state on startup:', {
          state: getJplTcpAdapterStateSummary(),
        }),
      2000,
    )
  })().catch((e: any) => {
    logger.error('[server] post-start initialization failed:', {
      error: serializeError(e),
    })
    updateStartupStatus({
      phase: 'degraded',
      message: 'Application started with initialization errors',
      detail: e?.message || String(e),
      progress: 100,
      completedAt: new Date().toISOString(),
    })
  })

  const shutdown = (signal: string) => {
    clearInterval(runtimeDiagnosticTimer)
    logger.info(`[server] received ${signal}. shutting down...`, {
      pid: process.pid,
      postgres: getPostgresPoolDiagnostics(),
      jplPersistence: getJplPersistenceQueueDiagnostics(),
      jplEventProcessing: getJplEventProcessingQueueDiagnostics(),
      forecourtMaterialization: getForecourtMaterializationQueueDiagnostics(),
    })
    void (runtime?.stop() ?? Promise.resolve()).finally(() => {
      try {
        stopForecourtConfigWatcher?.()
        releaseProcessLock?.()
      } catch {}
      server.close(() => process.exit(0))
      setTimeout(() => process.exit(0), 5000).unref()
    })
  }
  process.on('SIGINT', () => shutdown('SIGINT'))
  process.on('SIGTERM', () => shutdown('SIGTERM'))
}

main().catch((e) => {
  releaseProcessLock?.()
  logger.error('[server] fatal:', { error: serializeError(e) })
  process.exit(1)
})
