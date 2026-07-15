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
import path from 'path'
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
import {
  installConsoleCapture,
  updateConsoleCaptureStation,
} from '@/src/platform/logs/consoleCapture'
import {
  bootstrapRuntimeEnvironment,
  startLocalServerRuntime,
} from '@/src/platform/runtime'
import { getJplTcpAdapterState } from '@/src/shared/forecourt/adapters'
import {
  loadForecourtRuntimeConfigFromDb,
  startForecourtRuntimeConfigWatcher,
} from '@/src/shared/forecourt/runtime'
import { getStationId } from '@/src/shared/utils/getStationId'
import { logger } from '@/src/shared/utils/logger'

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
    logger.error('[startup-import] failed:', { error: e?.stack || e })
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

  const keyPath =
    process.env.VPOS_HTTPS_KEY_PATH ||
    path.join(process.cwd(), 'public/certs/localhost+2-key.pem')
  const certPath =
    process.env.VPOS_HTTPS_CERT_PATH ||
    path.join(process.cwd(), 'public/certs/localhost+2.pem')
  try {
    return https.createServer(
      { key: fs.readFileSync(keyPath), cert: fs.readFileSync(certPath) },
      handler,
    )
  } catch {
    return http.createServer(handler)
  }
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
    logger.error('[server] listen error:', { error: err?.stack || err })
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
        error: e?.stack || e,
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
          state: getJplTcpAdapterState(),
        }),
      2000,
    )
  })().catch((e: any) => {
    logger.error('[server] post-start initialization failed:', {
      error: e?.stack || e,
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
    logger.info(`[server] received ${signal}. shutting down...`)
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
  logger.error('[server] fatal:', { error: e?.stack || e })
  process.exit(1)
})
