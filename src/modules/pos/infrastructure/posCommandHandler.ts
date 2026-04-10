import type { PosCommandResult } from '@/src/shared/vpos/commands'

import { sendPosCommand } from '@/src/platform/integrations/posGateway'
import { getEffectivePosBackend } from '@/src/shared/integrations/posBackend'
import { kvSet } from '@/src/shared/storage/stationKv'

export async function handlePosCommand(
  stationId: string,
  req: any,
): Promise<PosCommandResult> {
  try {
    const backend = await getEffectivePosBackend(stationId)
    const dbOnlyTypes = new Set(['GET_DAILY_DATA'])
    if (backend === 'none' && !dbOnlyTypes.has(req.type)) {
      return {
        ok: false,
        type: req.type,
        error: {
          message: 'POS backend is disabled for this station (DB-first mode)',
          code: 'POS_BACKEND_DISABLED',
        },
      }
    }

    switch (req.type) {
      case 'PING': {
        const data = await sendPosCommand(stationId, { type: 'PING' })
        return { ok: !!data?.ok, type: req.type, data }
      }

      case 'POS_STATUS': {
        const data = await sendPosCommand(stationId, { type: 'POS_STATUS' })
        return { ok: !!data?.ok, type: req.type, data }
      }

      case 'COMPLETE_TRANSACTION': {
        const data = await sendPosCommand(stationId, {
          type: 'COMPLETE_TRANSACTION',
          payload: req.payload ?? {},
        })
        await kvSet(stationId, 'vpos.pos.lastTransaction', req.payload ?? {})
        return { ok: !!data?.ok, type: req.type, data }
      }

      case 'CAPTURE_CUSTOMER_DETAILS': {
        await kvSet(stationId, 'vpos.customer.current', req.payload ?? {})
        return { ok: true, type: req.type, data: { stored: true } }
      }

      case 'CLEAR_CUSTOMER_DETAILS': {
        await kvSet(stationId, 'vpos.customer.current', null)
        return { ok: true, type: req.type, data: { cleared: true } }
      }

      case 'GET_DAILY_DATA': {
        const { getDailyTotals } =
          await import('@/src/modules/transactions/infrastructure/dailyTotals')

        const businessDate =
          (req as any)?.businessDate ||
          (req as any)?.payload?.businessDate ||
          undefined

        const data = await getDailyTotals(stationId, businessDate, {
          maxAgeSeconds: 60,
        })
        return { ok: true, type: req.type, data }
      }

      default:
        return {
          ok: false,
          type: req.type,
          error: { message: `Unknown command type: ${(req as any).type}` },
        }
    }
  } catch (e: any) {
    return {
      ok: false,
      type: req.type,
      error: {
        message: e?.message ?? 'Command failed',
        code: e?.code,
        details: e?.details,
      },
    }
  }
}
