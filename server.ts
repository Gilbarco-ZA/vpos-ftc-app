/*
 * Single-process runtime entrypoint.
 *
 * Starts:
 *  - Startup legacy import (filesystem -> Postgres) once, moving imported files aside.
 *  - In-process runtime workers (polling loops) inside the same Node process.
 *  - Next.js server.
 *
 * Run with: npm start
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
  const legacyPermDir =
    process.env.LEGACY_PERM_DIR || '/opt/fccapps/vpos-perm/vposfiscal'
  const moveAsideRoot =
    process.env.LEGACY_IMPORT_DIR || '/opt/fccapps/vpos-perm/vposfiscal/legacy'

  try {
    const res = await importLegacyIfPresent({
      stationId,
      legacyPermDir,
      moveAsideRoot: moveAsideRoot || undefined,
      sourceType: 'vpos-console',
    })
    if (res)
      logger.info(
        `[startup-import] done. inserted=${JSON.stringify(
          res.inserted,
        )} moved=${JSON.stringify(res.moved)} warnings=${res.warnings.length}`,
      )
    else logger.info('[startup-import] nothing to import')
  } catch (e: any) {
    logger.error('[startup-import] failed:', { error: e?.stack || e })
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
    const key = fs.readFileSync(keyPath)
    const cert = fs.readFileSync(certPath)
    return https.createServer({ key, cert }, handler)
  } catch {
    return http.createServer(handler)
  }
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

  if (!Number.isFinite(port) || port <= 0) {
    throw new Error(`Invalid PORT value: ${String(port)}`)
  }

  logger.info(
    `[server] booting. dev=${dev} pid=${process.pid} stationId=${stationId}`,
  )

  const boot = await ensureBootstrapReady(stationId)
  if (boot.stationId && boot.stationId !== stationId) {
    stationId = boot.stationId
    updateConsoleCaptureStation(stationId)
  }

  await runStartupImport(stationId)

  await loadForecourtRuntimeConfigFromDb(stationId).catch((e) => {
    logger.error('[forecourt] failed to load runtime config from DB', {
      error: e?.stack || e,
    })
  })
  const stopForecourtConfigWatcher =
    startForecourtRuntimeConfigWatcher(stationId)

  const runtime = startLocalServerRuntime(stationId)

  const app = next({ dev, hostname, port })
  const handle = app.getRequestHandler()
  await app.prepare()

  const server = maybeHttpsServer((req, res) => handle(req, res))

  attachForecourtWs(server)

  setTimeout(() => {
    const st = getJplTcpAdapterState()
    logger.info('[FORECOURT] JPL TCP adapter state on startup:', { state: st })
  }, 2000)

  server.on('error', (err: any) => {
    if (err?.code === 'EADDRINUSE') {
      logger.error(
        `[server] port ${port} already in use on host ${hostname}. Set PORT to a free port and restart.`,
      )
      releaseProcessLock?.()
      process.exit(1)
      return
    }

    if (err?.code === 'EADDRNOTAVAIL') {
      logger.error(
        `[server] host ${hostname} is not available for binding. Use HOST=0.0.0.0 (or a valid local interface) and restart.`,
      )
      releaseProcessLock?.()
      process.exit(1)
      return
    }

    logger.error('[server] listen error:', { error: err?.stack || err })
    releaseProcessLock?.()
    process.exit(1)
  })

  server.listen(port, hostname, () => {
    logger.info(`[server] listening on ${hostname}:${port}`)
  })

  const shutdown = (signal: string) => {
    logger.info(`[server] received ${signal}. shutting down...`)
    void runtime.stop().finally(() => {
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
