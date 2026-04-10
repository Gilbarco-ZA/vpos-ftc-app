import {
  bootstrapWorkerEnvironment,
  requireWorkerStationId,
  resolveWorkerPollMs,
} from '@/workers/shared/bootstrap'

import { logger } from '@/src/shared/utils/logger'

export type WorkerController = {
  stop?: () => void | Promise<void>
} | void

export async function runWorkerEntrypoint(opts: {
  workerName: string
  pollEnvNames: string[]
  defaultPollMs: number
  start: (context: {
    stationId: string
    pollMs: number
  }) => WorkerController | Promise<WorkerController>
}) {
  bootstrapWorkerEnvironment()

  const pollMs = resolveWorkerPollMs(opts.pollEnvNames, opts.defaultPollMs)
  const stationId = requireWorkerStationId(opts.workerName)

  logger.info(`[${opts.workerName}]`, {
    msg: `starting pollMs=${pollMs} stationId=${stationId}`,
  })

  const controller = await opts.start({ stationId, pollMs })

  const shutdown = async (signal: string) => {
    logger.info(`[${opts.workerName}]`, {
      msg: `received ${signal}. exiting...`,
    })
    try {
      await controller?.stop?.()
    } finally {
      process.exit(0)
    }
  }

  process.on('SIGINT', () => {
    void shutdown('SIGINT')
  })
  process.on('SIGTERM', () => {
    void shutdown('SIGTERM')
  })

  return controller
}
