import type { ForecourtPendingPriceSetStatus } from '@/src/modules/forecourt/infrastructure/pendingPriceSetsRepo'

import {
  legacyDomsFailure,
  legacyDomsSuccess,
} from '@/src/shared/vpos/legacyPosApi'

import {
  deletePendingForecourtPriceSet,
  upsertPendingForecourtPriceSet,
} from '@/src/modules/forecourt/infrastructure/pendingPriceSetsRepo'
import { appendForecourtPriceScheduleEvent } from '@/src/modules/forecourt/infrastructure/priceScheduleEventsRepo'
import {
  appendWetstockEvent,
  markTankDeliveryCheckpointCleared,
} from '@/src/modules/forecourt/infrastructure/wetstockLifecycleRepo'
import { dispatchPosDomsCommand } from '@/src/modules/pos/application/legacy/doms'

import type { PosDomsRouteCommand } from './posDomsTypes'

type NormalizedDomsCommandBody = Record<string, unknown> & {
  deliveryReportSeqNo?: unknown
  DeliveryReportSeqNo?: unknown
  tankDeliveries?: unknown
  TankDeliveries?: unknown
  posId?: unknown
  PosId?: unknown
  tankId?: unknown
  TankId?: unknown
}

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
): NormalizedDomsCommandBody {
  const resolved =
    command === 'changeDynamicTankData' ||
    command === 'getTgErrorMsg' ||
    command === 'clearTankDeliveryData' ||
    command === 'openTankController' ||
    command === 'closeTankController' ||
    command === 'startDeliveryProcess' ||
    command === 'stopDeliveryProcess' ||
    command === 'clearFallbackTotals' ||
    command === 'markDeliveryStarting' ||
    command === 'markDeliveryFinished' ||
    command === 'blockTank' ||
    command === 'unblockTank' ||
    command === 'clearTgError' ||
    command === 'resetTg' ||
    command === 'changeFcDateTime' ||
    command === 'changeFcOperationMode' ||
    command === 'utilEcho'
      ? ((body?.data as unknown) ?? body)
      : body

  if (!resolved || typeof resolved !== 'object' || Array.isArray(resolved)) {
    return {}
  }

  return resolved as NormalizedDomsCommandBody
}

const resolvePendingStatus = (data: any): ForecourtPendingPriceSetStatus => {
  if (data?.scheduled) return 'confirmed_on_doms'
  if (data?.capabilities?.supportsPendingQueue === false) {
    return 'verification_unavailable'
  }
  return 'submitted_local'
}

export async function runPosDomsCommand(
  stationId: string,
  command: PosDomsRouteCommand,
  body: Record<string, unknown>,
  options: {
    userId?: string
  } = {},
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
    const pendingStatus = resolvePendingStatus(data)

    if (activationAtIso && Number.isFinite(priceSetId)) {
      const eventData = {
        activationAt: data?.activationAt ?? null,
        priceBank: data?.priceBank ?? null,
        warnings: data?.warnings ?? [],
        responseSubCode: data?.responseSubCode ?? null,
        requestedBy: data?.requestedBy ?? null,
        payload: normalizedBody ?? {},
      }

      await upsertPendingForecourtPriceSet({
        stationId,
        priceSetId,
        activationAt: activationAtIso,
        source: pendingStatus === 'confirmed_on_doms' ? 'doms' : 'local',
        status: pendingStatus,
        isConfirmedOnDoms: pendingStatus === 'confirmed_on_doms',
        lastEventType: pendingStatus,
        data: eventData,
      })

      await appendForecourtPriceScheduleEvent({
        stationId,
        priceSetId,
        activationAt: activationAtIso,
        eventType: 'submitted_local',
        source: 'local',
        submittedBy: options.userId ?? null,
        domsConfirmationStatus: pendingStatus,
        payload: normalizedBody ?? {},
        data: {
          ...eventData,
          controllerAccepted: Boolean(data?.controllerAccepted),
          verifiedOnController: Boolean(data?.verifiedOnController),
        },
      })

      if (pendingStatus === 'confirmed_on_doms') {
        await appendForecourtPriceScheduleEvent({
          stationId,
          priceSetId,
          activationAt: activationAtIso,
          eventType: 'confirmed_on_doms',
          source: 'doms',
          submittedBy: options.userId ?? null,
          domsConfirmationStatus: 'confirmed_on_doms',
          payload: data?.scheduled ?? {},
          data: {
            scheduled: data?.scheduled ?? null,
            responseSubCode: data?.responseSubCode ?? null,
          },
        })
      } else if (pendingStatus === 'verification_unavailable') {
        await appendForecourtPriceScheduleEvent({
          stationId,
          priceSetId,
          activationAt: activationAtIso,
          eventType: 'verification_unavailable',
          source: 'local',
          submittedBy: options.userId ?? null,
          domsConfirmationStatus: 'verification_unavailable',
          payload: normalizedBody ?? {},
          data: {
            responseSubCode: data?.responseSubCode ?? null,
            warnings: data?.warnings ?? [],
          },
        })
      }
    }
  }

  if (command === 'clearPendingPriceSet') {
    const activationAtRaw =
      normalizedBody?.activationAt ??
      normalizedBody?.priceSetActivationDateAndTime ??
      normalizedBody?.PriceSetActivationDateAndTime
    const activationAtIso = fcDateTimeToIso(activationAtRaw)
    const priceSetId = Number(
      normalizedBody?.priceSetId ??
        normalizedBody?.fcPriceSetId ??
        normalizedBody?.FcPriceSetId,
    )

    if (activationAtIso && Number.isFinite(priceSetId)) {
      await deletePendingForecourtPriceSet({
        stationId,
        priceSetId,
        activationAt: activationAtIso,
      })
      await appendForecourtPriceScheduleEvent({
        stationId,
        priceSetId,
        activationAt: activationAtIso,
        eventType: 'removed_from_pending_queue',
        source: 'doms',
        submittedBy: options.userId ?? null,
        domsConfirmationStatus: 'removed_from_pending_queue',
        payload: normalizedBody ?? {},
        data: {
          response: data ?? null,
        },
      })
    }
  }

  if (command === 'clearTankDeliveryData') {
    const deliveryReportSeqNo = String(
      normalizedBody?.deliveryReportSeqNo ??
        normalizedBody?.DeliveryReportSeqNo ??
        '0',
    ).trim()
    const tankDeliveries = Array.isArray(
      normalizedBody?.tankDeliveries ?? normalizedBody?.TankDeliveries,
    )
      ? (
          (normalizedBody?.tankDeliveries ??
            normalizedBody?.TankDeliveries) as any[]
        )
          .map((entry) => ({
            tgId: String(entry?.tgId ?? entry?.TgId ?? '')
              .trim()
              .padStart(2, '0'),
            tankDeliverySeqNo: String(
              entry?.tankDeliverySeqNo ?? entry?.TankDeliverySeqNo ?? '',
            ).trim(),
          }))
          .filter((entry) => entry.tgId && entry.tankDeliverySeqNo)
      : []

    if (deliveryReportSeqNo && tankDeliveries.length) {
      const rows = await markTankDeliveryCheckpointCleared({
        stationId,
        deliveryReportSeqNo,
        tankDeliveries,
        posId:
          String(normalizedBody?.posId ?? normalizedBody?.PosId ?? '').trim() ||
          null,
        payload: data,
        data: {
          commandPayload: normalizedBody,
        },
      })
      for (const row of rows) {
        await appendWetstockEvent({
          stationId,
          tankId: row.tank_id ?? null,
          tgId: row.tg_id ?? null,
          deliveryReportSeqNo: row.delivery_report_seq_no ?? null,
          tankDeliverySeqNo: row.tank_delivery_seq_no ?? null,
          eventType: 'cleared_on_doms',
          source: 'doms',
          payload: data,
          data: {
            commandPayload: normalizedBody,
          },
        })
      }
    }
  }

  if (
    command === 'openTankController' ||
    command === 'closeTankController' ||
    command === 'startDeliveryProcess' ||
    command === 'stopDeliveryProcess'
  ) {
    const tankId = String(
      normalizedBody?.tankId ?? normalizedBody?.TankId ?? '',
    )
      .trim()
      .padStart(2, '0')
    await appendWetstockEvent({
      stationId,
      tgId: tankId || null,
      eventType:
        command === 'openTankController'
          ? 'tank_controller_open_requested'
          : command === 'closeTankController'
            ? 'tank_controller_close_requested'
            : command === 'startDeliveryProcess'
              ? 'delivery_process_start_requested'
              : 'delivery_process_stop_requested',
      source: 'local',
      payload: normalizedBody,
      data: data ?? {},
    })
  }

  if (
    command === 'markDeliveryStarting' ||
    command === 'markDeliveryFinished' ||
    command === 'blockTank' ||
    command === 'unblockTank' ||
    command === 'clearTgError' ||
    command === 'resetTg'
  ) {
    await appendWetstockEvent({
      stationId,
      tankId:
        String(normalizedBody?.tankId ?? normalizedBody?.TankId ?? '').trim() ||
        null,
      tgId:
        String(
          normalizedBody?.tgId ??
            normalizedBody?.TgId ??
            normalizedBody?.tankId ??
            normalizedBody?.TankId ??
            '',
        ).trim() || null,
      deliveryReportSeqNo:
        String(data?.response?.data?.DeliveryReportSeqNo ?? '').trim() || null,
      tankDeliverySeqNo: null,
      eventType: command,
      source: 'doms',
      payload: data,
      data: {
        commandPayload: normalizedBody,
      },
    })
  }
  return legacyDomsSuccess(data)
}
