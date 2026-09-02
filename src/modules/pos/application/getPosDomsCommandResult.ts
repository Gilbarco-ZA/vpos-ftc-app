import {
  legacyDomsFailure,
  legacyDomsSuccess,
} from '@/src/shared/vpos/legacyPosApi'

import {
  resolveTankRecordsByGaugeIds,
  syncTankGaugeVolumes,
} from '@/src/modules/forecourt/application/tankGauge'
import {
  deleteActivatedPendingForecourtPriceSets,
  deletePendingForecourtPriceSet,
  listPendingForecourtPriceSets,
  upsertPendingForecourtPriceSet,
} from '@/src/modules/forecourt/infrastructure/pendingPriceSetsRepo'
import { appendForecourtPriceScheduleEvent } from '@/src/modules/forecourt/infrastructure/priceScheduleEventsRepo'
import {
  appendWetstockEvent,
  upsertTankDeliveryCheckpoint,
} from '@/src/modules/forecourt/infrastructure/wetstockLifecycleRepo'
import { dispatchPosDomsCommand } from '@/src/modules/pos/application/legacy/doms'

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
  const iso = date
    .toISOString()
    .replaceAll('-', '')
    .replaceAll(':', '')
    .replaceAll('T', '')
    .replaceAll('Z', '')
    .replaceAll('.', '')
    .slice(0, 14)
  return iso
}

type PendingView = {
  fcPriceSetId: string
  activationAt: string
  source?: string
  confirmedOnDoms?: boolean
  status?: string
  lastEventType?: string | null
  lastEventAt?: string | null
  data?: any
}

function normalizePendingItems(input: any, rows: Array<any>) {
  const live = Array.isArray(input?.pending) ? input.pending : []
  const merged = new Map<string, PendingView>()

  for (const item of live) {
    const key = `${String(item?.fcPriceSetId ?? '')}:${String(item?.activationAt ?? '')}`
    if (!key || key === ':') continue
    merged.set(key, {
      ...item,
      source: 'doms',
      confirmedOnDoms: true,
      status: 'confirmed_on_doms',
      lastEventType: 'confirmed_on_doms',
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
    const status = String(
      existing?.status ?? row.status ?? row.data?.status ?? '',
    ).trim()

    merged.set(key, {
      fcPriceSetId: priceSetId,
      activationAt,
      source: existing?.source ?? row.source ?? 'local',
      confirmedOnDoms:
        existing?.confirmedOnDoms ?? Boolean(row.is_confirmed_on_doms),
      status:
        status ||
        ((existing?.confirmedOnDoms ?? Boolean(row.is_confirmed_on_doms))
          ? 'confirmed_on_doms'
          : 'submitted_local'),
      lastEventType:
        existing?.lastEventType ??
        row.last_event_type ??
        row.data?.lastEventType ??
        null,
      lastEventAt:
        existing?.lastEventAt ??
        row.last_event_at ??
        row.data?.lastEventAt ??
        null,
      data: row.data ?? existing?.data ?? {},
    })
  }

  return Array.from(merged.values()).sort((a, b) =>
    String(a.activationAt ?? '').localeCompare(String(b.activationAt ?? '')),
  )
}

const makePendingKey = (priceSetId: unknown, activationAt: unknown) =>
  `${String(priceSetId ?? '').trim()}:${String(activationAt ?? '').trim()}`

export async function getPosDomsCommandResult(
  stationId: string,
  command: PosDomsRouteCommand,
  req: Request,
) {
  let payload: Record<string, unknown> | undefined

  if (command === 'getGradePrices') {
    const params = new URL(req.url).searchParams
    const type = params.get('type') ?? undefined
    payload = {
      type,
      ...(params.get('fcPriceSetId')
        ? { fcPriceSetId: params.get('fcPriceSetId') }
        : {}),
      ...(params.get('priceSetId')
        ? { priceSetId: params.get('priceSetId') }
        : {}),
      ...(params.get('activationAt')
        ? { activationAt: params.get('activationAt') }
        : {}),
      ...(params.get('priceSetActivationDateAndTime')
        ? {
            priceSetActivationDateAndTime: params.get(
              'priceSetActivationDateAndTime',
            ),
          }
        : {}),
    }
  }

  if (command === 'getAllTgData') {
    payload = { stationId }
  }

  if (command === 'getTgStatus') {
    const params = new URL(req.url).searchParams
    payload = {
      ...(params.get('tgId') ? { tgId: params.get('tgId') } : {}),
      ...(params.get('subCode') ? { subCode: params.get('subCode') } : {}),
    }
  }

  if (command === 'getSiteDeliveryStatus') {
    const params = new URL(req.url).searchParams
    payload = {
      ...(params.get('subCode') ? { subCode: params.get('subCode') } : {}),
    }
  }

  if (
    command === 'getFpGradeTotals' ||
    command === 'getPumpGradeTotals' ||
    command === 'getPumpGradeBlendTotals' ||
    command === 'getFallbackTotals' ||
    command === 'getTankControlStatus'
  ) {
    const params = new URL(req.url).searchParams
    payload = Object.fromEntries(params.entries())
  }

  if (command === 'getFcDateTime' || command === 'getFcOperationModeStatus') {
    payload = {}
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

    const storedBefore = await listPendingForecourtPriceSets(stationId)
    const nowIso = new Date().toISOString()

    if (activeAtIso) {
      const activatedRows = await deleteActivatedPendingForecourtPriceSets({
        stationId,
        priceSetId: Number.isFinite(activePriceSetId) ? activePriceSetId : null,
        activeAt: activeAtIso,
      })

      for (const row of activatedRows) {
        await appendForecourtPriceScheduleEvent({
          stationId,
          priceSetId: Number(row.price_set_id),
          activationAt: String(row.activation_at),
          eventType: 'activated_on_doms',
          source: 'doms',
          domsConfirmationStatus: 'activated_on_doms',
          payload: {
            activePriceSetId: Number.isFinite(activePriceSetId)
              ? activePriceSetId
              : null,
            activeAt: activeAtIso,
          },
          data: {
            previousStatus: row.status ?? null,
            rowData: row.data ?? {},
          },
        })
      }
    }

    const livePending = Array.isArray(data?.pending) ? data.pending : []
    const liveKeys = new Set<string>()

    for (const item of livePending) {
      const activationAtIso = fcDateTimeToIso(item?.activationAt)
      const priceSetId = Number(item?.fcPriceSetId)
      if (!activationAtIso || !Number.isFinite(priceSetId)) continue

      const key = makePendingKey(
        String(priceSetId).padStart(2, '0'),
        item?.activationAt,
      )
      liveKeys.add(key)

      const existing = storedBefore.find(
        (row) =>
          Number(row.price_set_id) === priceSetId &&
          String(row.activation_at) === activationAtIso,
      )

      await upsertPendingForecourtPriceSet({
        stationId,
        priceSetId,
        activationAt: activationAtIso,
        source: 'doms',
        status: 'confirmed_on_doms',
        isConfirmedOnDoms: true,
        lastEventType: 'confirmed_on_doms',
        data: item,
      })

      if (!existing || existing.status !== 'confirmed_on_doms') {
        await appendForecourtPriceScheduleEvent({
          stationId,
          priceSetId,
          activationAt: activationAtIso,
          eventType: 'confirmed_on_doms',
          source: 'doms',
          domsConfirmationStatus: 'confirmed_on_doms',
          payload: item,
          data: {
            previousStatus: existing?.status ?? null,
          },
        })
      }
    }

    for (const row of storedBefore) {
      const activationAtIso = String(row.activation_at ?? '').trim()
      const activationAt = isoToFcDateTime(activationAtIso)
      const key = makePendingKey(
        String(row.price_set_id ?? '').padStart(2, '0'),
        activationAt,
      )

      if (!activationAtIso || liveKeys.has(key)) continue
      if (Boolean(row.is_confirmed_on_doms) !== true) continue
      if (activationAtIso <= nowIso) continue

      const removed = await deletePendingForecourtPriceSet({
        stationId,
        priceSetId: Number(row.price_set_id),
        activationAt: activationAtIso,
      })
      if (!removed) continue

      await appendForecourtPriceScheduleEvent({
        stationId,
        priceSetId: Number(row.price_set_id),
        activationAt: activationAtIso,
        eventType: 'removed_from_pending_queue',
        source: 'doms',
        domsConfirmationStatus: 'removed_from_pending_queue',
        payload: {
          key,
          activePriceSetId: Number.isFinite(activePriceSetId)
            ? activePriceSetId
            : null,
          activeAt: activeAtIso,
        },
        data: {
          reason: 'missing_from_pending_queue',
          previousStatus: row.status ?? null,
          rowData: row.data ?? {},
        },
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

  if (command === 'getAllTgData') {
    const normalized = Array.isArray(data?.normalized) ? data.normalized : []
    const syncResult = normalized.length
      ? await syncTankGaugeVolumes(stationId, normalized)
      : { ok: true, updated: 0, tanks: [] }
    return legacyDomsSuccess({
      ...data,
      syncResult,
    })
  }

  if (command === 'getAllTankDeliveryData') {
    const normalizedDeliveries = Array.isArray(data?.normalizedDeliveries)
      ? data.normalizedDeliveries
      : []
    const tankRecordsByGaugeId = await resolveTankRecordsByGaugeIds(stationId)
    for (const entry of normalizedDeliveries) {
      const normalized = entry?.normalized ?? {}
      const tgId = String(normalized?.tgId ?? '')
        .trim()
        .padStart(2, '0')
      const deliveryReportSeqNo = String(
        normalized?.deliveryReportSeqNo ?? '',
      ).trim()
      const tankDeliverySeqNo = String(
        normalized?.tankDeliverySeqNo ?? '',
      ).trim()
      if (!tgId || !deliveryReportSeqNo || !tankDeliverySeqNo) continue
      const record = tankRecordsByGaugeId.get(tgId)
      await upsertTankDeliveryCheckpoint({
        stationId,
        tankId: record?.tankId ?? null,
        tgId,
        deliveryReportSeqNo,
        tankDeliverySeqNo,
        posId: normalized?.posId ?? null,
        clearStatus: 'pending_clear',
        source: 'doms',
        lastEventType: 'delivery_data_observed',
        payload: normalized,
        data: {
          siteDeliveryStatus: data?.siteDeliveryStatus ?? null,
        },
      })
      await appendWetstockEvent({
        stationId,
        tankId: record?.tankId ?? null,
        tgId,
        deliveryReportSeqNo,
        tankDeliverySeqNo,
        eventType: 'delivery_data_observed',
        source: 'doms',
        payload: normalized,
        data: {
          checkpointSummary: data?.checkpointSummary ?? [],
        },
      })
    }
  }

  return legacyDomsSuccess(data)
}
