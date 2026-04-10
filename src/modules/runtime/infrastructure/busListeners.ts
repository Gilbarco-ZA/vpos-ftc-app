import { query } from '@/src/platform/db/postgres'
import { recordPendingAttendantAuthRequest } from '@/src/shared/pos/attendantAuth'
import { getRuntimeBus } from '@/src/shared/runtime/bus'
import { getStationId } from '@/src/shared/utils/getStationId'
import { logger } from '@/src/shared/utils/logger'
import { uuidv4 } from '@/src/shared/utils/uuid'

import { archiveEvent } from '@/src/modules/archive/infrastructure/archiveEventsRepo'

import {
  clearPendingFiscalAuth,
  recordPendingFiscalAuth,
} from './fiscalRecoveryPolicy'

let posStarted = false
let fiscalStarted = false
let archiveStarted = false

type AnyBusMsg = {
  type?: string
  stationId?: string
  requestId?: string
} & Record<string, any>

async function storePosCommandResult(commandId: string, result: any) {
  const status = result?.ok ? 'COMPLETED' : 'FAILED'

  await query(
    `INSERT INTO pos_command_results (id, command_id, status, result_json)
       VALUES ($1, $2, 'PENDING', '{}'::jsonb)
       ON CONFLICT DO NOTHING`,
    [uuidv4(), commandId],
  )

  await query(
    `UPDATE pos_command_results
        SET status = $2,
            result_json = $3,
            received_at = NOW(),
            updated_at = NOW()
      WHERE command_id = $1`,
    [commandId, status, result as any],
  )

  await query(
    `UPDATE pos_commands
        SET status = $2,
            updated_at = NOW()
      WHERE id = $1`,
    [commandId, status],
  )
}

export function startPosBusListener() {
  if (posStarted) return
  posStarted = true

  const bus = getRuntimeBus()
  bus.subscribe<AnyBusMsg>('pos', (msg) => {
    void (async () => {
      if (!msg || typeof msg !== 'object') return

      if (msg.type === 'attendantAuthRequest') {
        const stationId = String(msg.stationId ?? '')
        const requestId = String(msg.requestId ?? msg.id ?? '')
        if (!stationId || !requestId) return

        await recordPendingAttendantAuthRequest(stationId, {
          id: requestId,
          createdAt: Number(msg.at ?? Date.now()),
          fpId: msg.fpId ?? msg.payload?.fpId ?? null,
          reason: msg.reason ?? null,
          payload: msg.payload ?? null,
        })
      }

      if (msg.type === 'fiscalAuthResponse') {
        const stationId = String(msg.stationId ?? '')
        const requestId = String(msg.requestId ?? '')
        if (!stationId || !requestId) return

        await clearPendingFiscalAuth(stationId, requestId)
        await storePosCommandResult(requestId, {
          ok: !!msg.ok,
          accepted: true,
          message: msg.ok
            ? 'Fiscal auth completed'
            : (msg.error?.message ?? 'Fiscal auth failed'),
          error: msg.error ?? null,
          at: msg.at ?? Date.now(),
        })
      }
    })().catch((e) => logger.error('[posBusListener]', { error: e }))
  })
}

export function startFiscalBusListener() {
  if (fiscalStarted) return
  fiscalStarted = true

  const bus = getRuntimeBus()
  bus.subscribe<AnyBusMsg>('fiscal', (msg) => {
    void (async () => {
      if (!msg || typeof msg !== 'object') return

      if (msg.type === 'fiscalAuthRequest') {
        const stationId = String(msg.stationId ?? '')
        const requestId = String(msg.requestId ?? '')
        if (!stationId || !requestId) return

        await recordPendingFiscalAuth(stationId, {
          id: requestId,
          createdAt: Number(msg.at ?? Date.now()),
        })
      }

      if (msg.type === 'fiscalAuthResponse') {
        await bus.publish('pos', {
          ...msg,
          stationId: String(msg.stationId ?? ''),
          requestId: String(msg.requestId ?? ''),
          ok: !!msg.ok,
          at: Number(msg.at ?? Date.now()),
        })
      }
    })().catch((e) => logger.error('[fiscalBusListener]', { error: e }))
  })
}

export function startArchiveBusListener() {
  if (archiveStarted) return
  archiveStarted = true

  const bus = getRuntimeBus()
  bus.subscribe('*', async (msg: AnyBusMsg) => {
    try {
      const stationId = String(msg?.stationId ?? getStationId())
      const topic = String(msg?.topic ?? msg?.type ?? 'unknown')
      const messageType = String(msg?.type ?? 'message')
      const requestId = msg?.requestId ? String(msg.requestId) : null

      await archiveEvent({
        stationId,
        topic,
        messageType,
        payload: msg,
        source: 'runtimeBus',
        requestId,
      })
    } catch {
      // best effort only
    }
  })
}
