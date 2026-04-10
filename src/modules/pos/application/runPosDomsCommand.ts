import { dispatchPosDomsCommand } from '@/src/shared/pos/doms'
import {
  legacyDomsFailure,
  legacyDomsSuccess,
} from '@/src/shared/vpos/legacyPosApi'

import { upsertPendingForecourtPriceSet } from '@/src/modules/forecourt/infrastructure/pendingPriceSetsRepo'

import type { PosDomsRouteCommand } from './posDomsTypes'

function fcDateTimeToIso(value: unknown): string | null {
  const text = String(value ?? '').trim()
  if (!/^\d{14}$/.test(text)) return null
  const iso = `${text.slice(0, 4)}-${text.slice(4, 6)}-${text.slice(6, 8)}T${text.slice(8, 10)}:${text.slice(10, 12)}:${text.slice(12, 14)}Z`
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

function normalizePayload(
  command: PosDomsRouteCommand,
  body: Record<string, unknown>,
) {
  if (command === 'changeDynamicTankData' || command === 'getTgErrorMsg') {
    return (body?.data as unknown) ?? body
  }
  return body
}

export async function runPosDomsCommand(
  stationId: string,
  command: PosDomsRouteCommand,
  body: Record<string, unknown>,
) {
  const normalizedBody = normalizePayload(command, body)
  const result = await dispatchPosDomsCommand(
    stationId,
    command,
    normalizedBody,
  )

  if ((result as any)?.ok === false) {
    return legacyDomsFailure(
      (result as any).error ?? result,
      (result as any).error ?? (result as any).message,
    )
  }

  const data = ((result as any)?.data ?? result) as any

  if (command === 'changeGradePrices') {
    const activationAtIso = fcDateTimeToIso(data?.activationAt)
    const priceSetId = Number(
      data?.priceBank?.fcPriceSetId ?? data?.response?.data?.FcPriceSetId,
    )
    if (activationAtIso && Number.isFinite(priceSetId)) {
      await upsertPendingForecourtPriceSet({
        stationId,
        priceSetId,
        activationAt: activationAtIso,
        source: 'local',
        isConfirmedOnDoms: Boolean(data?.scheduled),
        data: {
          activationAt: data?.activationAt ?? null,
          priceBank: data?.priceBank ?? null,
          warnings: data?.warnings ?? [],
          responseSubCode: data?.responseSubCode ?? null,
          requestedBy: data?.requestedBy ?? null,
          payload: normalizedBody ?? {},
        },
      })
    }
  }

  return legacyDomsSuccess(data)
}
