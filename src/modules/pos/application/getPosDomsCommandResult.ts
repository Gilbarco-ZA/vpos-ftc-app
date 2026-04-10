import { dispatchPosDomsCommand } from '@/src/shared/pos/doms'
import {
  legacyDomsFailure,
  legacyDomsSuccess,
} from '@/src/shared/vpos/legacyPosApi'

import {
  deleteActivatedPendingForecourtPriceSets,
  listPendingForecourtPriceSets,
  upsertPendingForecourtPriceSet,
} from '@/src/modules/forecourt/infrastructure/pendingPriceSetsRepo'

import type { PosDomsRouteCommand } from './posDomsTypes'

function fcDateTimeToIso(value: unknown): string | null {
  const text = String(value ?? '').trim()
  if (!/^\d{14}$/.test(text)) return null
  const iso = `${text.slice(0, 4)}-${text.slice(4, 6)}-${text.slice(6, 8)}T${text.slice(8, 10)}:${text.slice(10, 12)}:${text.slice(12, 14)}Z`
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

function extractStatusData(input: any) {
  return input?.status?.data ?? input?.status?.payload?.data ?? null
}

function isoToFcDateTime(value: unknown): string {
  const date = new Date(String(value ?? ''))
  if (Number.isNaN(date.getTime())) return ''
  const iso = date.toISOString().replace(/[-:TZ.]/g, '')
  return iso.slice(0, 14)
}

function normalizePendingItems(input: any, rows: Array<any>) {
  const live = Array.isArray(input?.pending) ? input.pending : []
  const merged = new Map<string, any>()

  for (const item of live) {
    const key = `${String(item?.fcPriceSetId ?? '')}:${String(item?.activationAt ?? '')}`
    if (!key || key === ':') continue
    merged.set(key, {
      ...item,
      source: 'doms',
      confirmedOnDoms: true,
    })
  }

  for (const row of rows) {
    const rawActivationAt = String(
      row.data?.activationAt ?? row.data?.fcActivationAt ?? '',
    ).trim()
    const activationAtIso = String(row.activation_at ?? '').trim()
    const activationAt =
      rawActivationAt ||
      (activationAtIso ? isoToFcDateTime(activationAtIso) : '')
    const priceSetId = String(row.price_set_id ?? '').padStart(2, '0')
    if (!priceSetId || !activationAt) continue
    const key = `${priceSetId}:${activationAt}`
    const existing = merged.get(key)
    merged.set(key, {
      fcPriceSetId: priceSetId,
      activationAt,
      source: existing?.source ?? row.source ?? 'local',
      confirmedOnDoms:
        existing?.confirmedOnDoms ?? Boolean(row.is_confirmed_on_doms),
      data: row.data ?? existing?.data ?? {},
    })
  }

  return Array.from(merged.values()).sort((a, b) =>
    String(a.activationAt ?? '').localeCompare(String(b.activationAt ?? '')),
  )
}

export async function getPosDomsCommandResult(
  stationId: string,
  command: PosDomsRouteCommand,
  req: Request,
) {
  let payload: Record<string, unknown> | undefined

  if (command === 'getGradePrices') {
    const type = new URL(req.url).searchParams.get('type') ?? undefined
    payload = { type }
  }

  if (command === 'getAllTgData') {
    payload = { stationId }
  }

  const result = await dispatchPosDomsCommand(stationId, command, payload)

  if ((result as any)?.ok === false) {
    return legacyDomsFailure(
      (result as any).error ?? result,
      (result as any).error ?? (result as any).message,
    )
  }

  const data = ((result as any)?.data ?? result) as any

  if (command === 'getGradePrices') {
    const statusData = extractStatusData(data)
    const activePriceSetIdRaw =
      statusData?.FcPriceSetId ?? statusData?.fcPriceSetId ?? null
    const activePriceSetId = Number(activePriceSetIdRaw)
    const activeAtIso = fcDateTimeToIso(
      statusData?.FcPriceSetDateAndTime ??
        statusData?.fcPriceSetDateAndTime ??
        null,
    )

    if (activeAtIso) {
      await deleteActivatedPendingForecourtPriceSets({
        stationId,
        priceSetId: Number.isFinite(activePriceSetId) ? activePriceSetId : null,
        activeAt: activeAtIso,
      })
    }

    const livePending = Array.isArray(data?.pending) ? data.pending : []
    for (const item of livePending) {
      const activationAtIso = fcDateTimeToIso(item?.activationAt)
      const priceSetId = Number(item?.fcPriceSetId)
      if (!activationAtIso || !Number.isFinite(priceSetId)) continue
      await upsertPendingForecourtPriceSet({
        stationId,
        priceSetId,
        activationAt: activationAtIso,
        source: 'doms',
        isConfirmedOnDoms: true,
        data: item,
      })
    }

    const storedPending = await listPendingForecourtPriceSets(stationId)
    const mergedPending = normalizePendingItems(data, storedPending)
    data.pending = mergedPending

    if (mergedPending.some((item: any) => item.confirmedOnDoms !== true)) {
      const warnings = Array.isArray(data?.warnings) ? [...data.warnings] : []
      warnings.push(
        'Showing locally recorded scheduled price sets that are not yet confirmed by the controller.',
      )
      data.warnings = Array.from(new Set(warnings))
    }
  }

  return legacyDomsSuccess(data)
}
