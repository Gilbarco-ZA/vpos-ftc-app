import {
  getJplAdapterState,
  setJplAdapterState,
} from '@/src/shared/forecourt/jplState'

import {
  normalizeFpErrorPayload,
  normalizeFpFuellingDataPayload,
  normalizeFpInfoPayload,
  normalizeFpStatusPayload,
  normalizeSiteDeliveryStatusPayload,
  normalizeTankDeliveryDataPayload,
  normalizeTgDataPayload,
  normalizeTgStatusPayload,
} from '@/src/modules/forecourt/infrastructure/jpl/protocol/normalize'

export const toResponseEnvelopeData = (response: any) =>
  response?.data ?? response?.payload?.data ?? response?.payload ?? response

function upsertSnapshotByKey(
  list: any[] | undefined,
  key: string,
  value: any,
  limit = 32,
) {
  const filtered = (list ?? []).filter(
    (entry) => String(entry?.[key] ?? '') !== String(value?.[key] ?? ''),
  )
  return [value, ...filtered].slice(0, limit)
}

export function rememberGatewaySnapshot(
  kind: string,
  response: any,
  usedSubCode?: string,
) {
  const envelope = toResponseEnvelopeData(response) ?? {}
  const at = Date.now()

  if (kind === 'FpStatus_resp') {
    const normalized = normalizeFpStatusPayload(envelope, usedSubCode)
    setJplAdapterState({
      lastFpStatuses: upsertSnapshotByKey(
        getJplAdapterState().lastFpStatuses,
        'fpId',
        {
          fpId: normalized.fpId,
          subCode: usedSubCode,
          normalized,
          payload: envelope,
          at,
        },
        48,
      ) as any,
    } as any)
    return normalized
  }

  if (kind === 'FpInfo_resp') {
    const normalized = normalizeFpInfoPayload(envelope, usedSubCode)
    const state = getJplAdapterState() as any
    setJplAdapterState({
      lastFpInfo: upsertSnapshotByKey(
        state.lastFpInfo,
        'fpId',
        {
          fpId: normalized.fpId,
          subCode: usedSubCode,
          normalized,
          payload: envelope,
          at,
        },
        48,
      ),
    })
    return normalized
  }

  if (kind === 'FpFuellingData_resp') {
    const normalized = normalizeFpFuellingDataPayload(envelope, usedSubCode)
    const state = getJplAdapterState() as any
    setJplAdapterState({
      lastFpFuellingData: upsertSnapshotByKey(
        state.lastFpFuellingData,
        'fpId',
        {
          fpId: normalized.fpId,
          subCode: usedSubCode,
          normalized,
          payload: envelope,
          at,
        },
        48,
      ),
    })
    return normalized
  }

  if (kind === 'FpErrorMsg_resp') {
    const normalized = normalizeFpErrorPayload(envelope, usedSubCode)
    const state = getJplAdapterState() as any
    setJplAdapterState({
      lastFpErrors: upsertSnapshotByKey(
        state.lastFpErrors,
        'fpId',
        {
          fpId: normalized.fpId,
          subCode: usedSubCode,
          normalized,
          payload: envelope,
          at,
        },
        48,
      ),
    })
    return normalized
  }

  if (kind === 'TgStatus_resp') {
    const normalized = normalizeTgStatusPayload(envelope, usedSubCode)
    const state = getJplAdapterState() as any
    setJplAdapterState({
      lastTgStatuses: upsertSnapshotByKey(
        state.lastTgStatuses,
        'tgId',
        {
          tgId: normalized.tgId,
          subCode: usedSubCode,
          normalized,
          payload: envelope,
          at,
        },
        48,
      ),
    })
    return normalized
  }

  if (kind === 'TgData_resp') {
    const normalized = normalizeTgDataPayload(envelope, usedSubCode)
    const state = getJplAdapterState() as any
    setJplAdapterState({
      lastTgData: upsertSnapshotByKey(
        state.lastTgData,
        'tgId',
        {
          tgId: normalized.tgId,
          subCode: usedSubCode,
          normalized,
          payload: envelope,
          at,
        },
        48,
      ),
    })
    return normalized
  }

  if (kind === 'SiteDeliveryStatus_resp') {
    const normalized = normalizeSiteDeliveryStatusPayload(envelope, usedSubCode)
    setJplAdapterState({
      lastSiteDeliveryStatus: {
        subCode: usedSubCode,
        normalized,
        payload: envelope,
        at,
      },
    } as any)
    return normalized
  }

  if (kind === 'TankDeliveryData_resp') {
    const normalized = normalizeTankDeliveryDataPayload(envelope, usedSubCode)
    const state = getJplAdapterState() as any
    setJplAdapterState({
      lastTankDeliveryData: upsertSnapshotByKey(
        state.lastTankDeliveryData,
        'deliveryReportSeqNo',
        {
          tgId: normalized.tgId,
          deliveryReportSeqNo: normalized.deliveryReportSeqNo,
          subCode: usedSubCode,
          normalized,
          payload: envelope,
          at,
        },
        48,
      ),
    })
    return normalized
  }

  return envelope
}
