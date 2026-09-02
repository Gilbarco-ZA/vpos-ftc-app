import { bootstrapRuntimeEnvironment } from '@/src/platform/runtime'
import { kvGet } from '@/src/shared/storage/stationKv'
import { getStationId } from '@/src/shared/utils/getStationId'
import { logger } from '@/src/shared/utils/logger'

import { enqueueFiscalInboxMessage } from '@/src/modules/fiscal-inbox/application/fiscalInbox'

type PendingAuth = { id: string; createdAt: number }

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

function envInt(name: string, def: number): number {
  const v = process.env[name]
  if (!v) return def
  const n = Number.parseInt(v, 10)
  return Number.isFinite(n) ? n : def
}

async function main(): Promise<void> {
  bootstrapRuntimeEnvironment()
  const stationId = getStationId()

  // How long after an auth request we emit a response.
  const respondAfterMs = envInt('FISCAL_STUB_RESPOND_AFTER_MS', 800)
  // Optional: failure rate (0..1). Use to exercise timeout/retry paths.
  const failRate = Number.parseFloat(process.env.FISCAL_STUB_FAIL_RATE ?? '0')
  const pollMs = envInt('FISCAL_STUB_POLL_MS', 1000)

  logger.info('[fiscal-stub]', {
    msg: `stationId=${stationId} respondAfterMs=${respondAfterMs} pollMs=${pollMs} failRate=${failRate}`,
  })

  for (;;) {
    try {
      const pending =
        (await kvGet<PendingAuth[]>(stationId, 'vpos.fiscal.pendingAuth')) ?? []

      const now = Date.now()
      for (const req of pending) {
        if (!req?.id || typeof req.createdAt !== 'number') continue
        if (now - req.createdAt < respondAfterMs) continue

        const shouldFail =
          Number.isFinite(failRate) && failRate > 0 && Math.random() < failRate

        const msg = {
          type: 'fiscalAuthResponse',
          stationId,
          requestId: req.id,
          ok: !shouldFail,
          error: shouldFail
            ? { code: 'FISCAL_STUB_FAIL', message: 'Simulated fiscal failure' }
            : undefined,
          at: now,
        }

        // Durable write: supervisorMonitorWorker will drain fiscal_inbox
        // and publish onto the in-process bus.
        await enqueueFiscalInboxMessage({
          stationId,
          topic: 'fiscal',
          requestId: req.id,
          message: msg,
        })

        logger.info('[fiscal-stub]', {
          msg: `emitted fiscalAuthResponse requestId=${req.id} ok=${!shouldFail}`,
        })
      }
    } catch (err) {
      logger.error('[fiscal-stub]', { msg: 'loop error', error: err })
    }

    await sleep(pollMs)
  }
}

void main()
