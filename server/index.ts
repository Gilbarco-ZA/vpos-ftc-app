/** @deprecated Legacy server entrypoint. Keep compatibility only while migrations continue. */
import http from 'node:http'
import next from 'next'

import {
  installConsoleCapture,
  updateConsoleCaptureStation,
} from '@/src/platform/logs/consoleCapture'
import { bootstrapRuntimeEnvironment } from '@/src/platform/runtime'
import { getJplTcpAdapterState } from '@/src/shared/forecourt/adapters'
import {
  loadForecourtRuntimeConfigFromDb,
  startForecourtRuntimeConfigWatcher,
} from '@/src/shared/forecourt/runtime'
import { getStationId } from '@/src/shared/utils/getStationId'
import { logger } from '@/src/shared/utils/logger'

import { attachForecourtWs } from './forecourtWs'

bootstrapRuntimeEnvironment()

const dev = process.env.NODE_ENV !== 'production'
const hostname = process.env.HOSTNAME || '0.0.0.0'
const port = Number(process.env.PORT || 3080)

const app = next({ dev, hostname, port })
const handle = app.getRequestHandler()

const startServer = async () => {
  await app.prepare()

  // DB-first forecourt settings (remote-friendly)
  const stationId = getStationId()
  installConsoleCapture(stationId)
  updateConsoleCaptureStation(stationId)
  await loadForecourtRuntimeConfigFromDb(stationId).catch((e) => {
    logger.error('[forecourt] failed to load runtime config from DB', {
      error: e,
    })
  })
  startForecourtRuntimeConfigWatcher(stationId)

  const server = http.createServer((req, res) => {
    handle(req, res)
  })

  attachForecourtWs(server)

  setTimeout(() => {
    const st = getJplTcpAdapterState()
    logger.info('[FORECOURT] JPL TCP adapter state on startup:', { state: st })
  }, 2000)

  server.listen(port, hostname, () => {
    logger.info(`VPOS FTC app listening on http://${hostname}:${port}`)
  })
}

void startServer()
