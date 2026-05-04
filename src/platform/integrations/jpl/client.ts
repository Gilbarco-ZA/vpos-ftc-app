import type {
  JplHealth,
  PosCommand,
  PosCommandResult,
} from '@/src/platform/integrations/jpl/types'
import type { JplAccessMode } from '@/src/shared/integrations/jplAccess'

import { getJplConfig } from '@/src/platform/integrations/jpl/config'
import {
  ensureJplGatewayStarted,
  getJplClient,
  getJplGatewayState,
} from '@/src/platform/integrations/jpl/gateway'
import {
  normalizeTgDataPayload,
  resolveConfiguredTankGaugeIds,
} from '@/src/shared/doms/tankGauge'
import {
  getJplAdapterState,
  setJplAdapterState,
} from '@/src/shared/forecourt/jplState'
import { assertJplAccessAllowed } from '@/src/shared/integrations/jplAccess'
import { logger } from '@/src/shared/utils/logger'

import { buildFpStatusSubCodePreference } from '@/src/modules/forecourt/infrastructure/jpl/dispense'
import {
  buildJplCommandRequest,
  describeJplAuthorizeRequest,
} from '@/src/modules/forecourt/infrastructure/jpl/protocol/commands'
import {
  normalizeFpErrorPayload,
  normalizeFpFuellingDataPayload,
  normalizeFpInfoPayload,
  normalizeFpStatusPayload,
  normalizeSiteDeliveryStatusPayload,
  normalizeTankDeliveryDataPayload,
  normalizeTgStatusPayload,
} from '@/src/modules/forecourt/infrastructure/jpl/protocol/normalize'
import {
  buildClearSupervisedTransactionRequest,
  buildClearUnsupervisedTransactionRequest,
  buildReadSupervisedTransactionRequest,
  buildReadUnsupervisedTransactionRequest,
  buildUnlockSupervisedTransactionRequest,
  buildUnlockUnsupervisedTransactionRequest,
  extractTransactionCore,
  getReplayStatusSummary,
  resolveTransactionParIds,
} from '@/src/modules/forecourt/infrastructure/jpl/transactionService'

function timeout<T>(ms: number, message: string): Promise<T> {
  return new Promise((_, reject) => {
    const t = setTimeout(() => {
      clearTimeout(t)
      reject(Object.assign(new Error(message), { code: 'TIMEOUT' }))
    }, ms)
  })
}

// Serialize outbound commands per-APC to avoid response race conditions.
// DOMS JPL responses do not always include a strong correlation id.
let apc1Queue: Promise<any> = Promise.resolve()

function enqueueApc1<T>(fn: () => Promise<T>): Promise<T> {
  const next = apc1Queue.then(fn, fn)
  // prevent unhandled rejection chains
  apc1Queue = next.catch(() => undefined)
  return next
}

const ZERO_FC_DATE_TIME = '00000000000000'

async function assertJplAccessAllowedForMode(
  stationId: string,
  accessMode: JplAccessMode = 'pos',
) {
  await assertJplAccessAllowed(stationId, accessMode)
}
const ID_ZERO = '00'
const CURRENT_PRICE_SET_TYPE = '00H'
const PENDING_PRICE_SET_TYPE = '01H'

const toId2 = (value: number) => {
  const n = Number.isFinite(value) ? Math.trunc(value) : 0
  return String(Math.max(0, n)).padStart(2, '0')
}

const toInt = (value: unknown, fallback: number) => {
  const n = Number(value)
  return Number.isFinite(n) ? Math.trunc(n) : fallback
}

const pick = (value: any, keys: string[]) => {
  for (const key of keys) {
    if (value && Object.prototype.hasOwnProperty.call(value, key)) {
      return value[key]
    }
  }
  return undefined
}

const unwrapValue = (value: any) => {
  if (value && typeof value === 'object' && 'value' in value) {
    return (value as any).value
  }
  return value
}

const toId2String = (value: unknown, fallback = ID_ZERO) => {
  if (typeof value === 'string' && /^\d+$/.test(value.trim())) {
    return value.trim().padStart(2, '0')
  }
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return fallback
  return String(Math.max(0, Math.trunc(parsed))).padStart(2, '0')
}

const toRequestData = (response: any) => response?.data ?? response ?? {}

const ALL_TANK_DELIVERY_ITEM_IDS = Array.from({ length: 29 }, (_, index) =>
  String(index + 1).padStart(2, '0'),
)

const ALL_TANK_DATA_ITEM_IDS = [
  '01',
  '02',
  '03',
  '04',
  '05',
  '06',
  '07',
  '08',
  '09',
  '10',
  '11',
  '14',
  '15',
  '16',
  '17',
  '18',
  '19',
  '20',
  '41',
  '42',
  '43',
  '44',
]

const toResponseEnvelopeData = (response: any) =>
  response?.data ?? response?.payload?.data ?? response?.payload ?? response

const coerceId2List = (value: unknown): string[] => {
  if (!Array.isArray(value)) return []

  return value
    .map((item) =>
      toId2String(pick(item, ['TgId', 'TankId', 'id', 'value']) ?? item, ''),
    )
    .filter(Boolean)
}

const extractMultiMessageEntries = (response: any): any[] => {
  const envelope = toResponseEnvelopeData(response)
  const messages =
    envelope?.messages ??
    envelope?.Messages ??
    response?.messages ??
    response?.Messages

  return Array.isArray(messages) ? messages : []
}

const extractDeliveryTgIdsFromSiteStatus = (response: any): string[] => {
  const envelope = toResponseEnvelopeData(response)

  const candidates = [
    envelope?.TankDeliveries,
    envelope?.TankTicketedDeliveries,
    envelope?.TgId,
    envelope?.TgIds,
    envelope?.TankGauges,
    envelope?.TankGaugeIds,
  ]

  const ids = candidates.flatMap((candidate) => coerceId2List(candidate))
  return Array.from(new Set(ids))
}

const hasDeliveryStatusBit = (value: any, key: string) => {
  if (!value || typeof value !== 'object') return false
  return Boolean(value?.bits?.[key] ?? value?.[key])
}

const extractDeliveryTgIdsFromTgStatus = (response: any): string[] => {
  const multiMessages = extractMultiMessageEntries(response)
  const tgMessages = multiMessages.filter((entry) => {
    const name = String(entry?.name ?? entry?.Name ?? '').trim()
    return name === 'TgStatus_resp'
  })

  const payloads = tgMessages.length
    ? tgMessages.map(
        (entry) => entry?.data ?? entry?.Data ?? entry?.payload ?? entry,
      )
    : [toResponseEnvelopeData(response)]

  return payloads
    .flatMap((payload) => {
      const tgId = toId2String(payload?.TgId, '')
      if (!tgId) return []

      const subStates = payload?.TgSubStates
      if (
        hasDeliveryStatusBit(subStates, 'DeliveryDataReady') ||
        hasDeliveryStatusBit(subStates, 'DeliveryInProgress') ||
        hasDeliveryStatusBit(subStates, 'TicketedDeliveryDataReady') ||
        hasDeliveryStatusBit(subStates, 'TicketedDeliveryInProgress')
      ) {
        return [tgId]
      }

      return []
    })
    .filter(Boolean)
}

const formatFcDateTime = (date: Date) => {
  const yyyy = String(date.getFullYear()).padStart(4, '0')
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const dd = String(date.getDate()).padStart(2, '0')
  const hh = String(date.getHours()).padStart(2, '0')
  const mi = String(date.getMinutes()).padStart(2, '0')
  const ss = String(date.getSeconds()).padStart(2, '0')
  return `${yyyy}${mm}${dd}${hh}${mi}${ss}`
}

const toFcDateTime = (value: unknown): string => {
  if (value == null || value === '') return ZERO_FC_DATE_TIME
  if (value instanceof Date) return formatFcDateTime(value)

  const text = String(value).trim()
  if (!text) return ZERO_FC_DATE_TIME
  if (/^\d{14}$/.test(text)) return text
  if (/^\d{8}$/.test(text)) return `${text}000000`

  const localDateMatch = text.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (localDateMatch) {
    return `${localDateMatch[1]}${localDateMatch[2]}${localDateMatch[3]}000000`
  }

  const localDateTimeMatch = text.match(
    /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?$/,
  )
  if (localDateTimeMatch) {
    const [, yyyy, mm, dd, hh, mi, ss = '00'] = localDateTimeMatch
    return `${yyyy}${mm}${dd}${hh}${mi}${ss}`
  }

  const normalized =
    text.includes(',') && !text.includes('.') ? text.replace(',', '.') : text
  const date = new Date(normalized)
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid effective date/time: ${text}`)
  }
  return formatFcDateTime(date)
}

const normalizePriceValue = (value: unknown) => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    if (Number.isInteger(value)) return String(Math.trunc(value))
    return String(Math.round(value * 100))
  }

  const text = String(value ?? '').trim()
  if (!text) throw new Error('Missing price value')
  if (/^\d+$/.test(text)) return text

  const normalized = text.replace(/,/g, '.')
  if (/^\d+(\.\d+)?$/.test(normalized)) {
    return String(Math.round(Number(normalized) * 100))
  }

  throw new Error(`Invalid price value: ${text}`)
}

const asIdList = (input: unknown): string[] => {
  if (!Array.isArray(input)) return []
  return input
    .map((item) =>
      toId2String(
        pick(item, ['FcPriceGroupId', 'FcGradeId', 'id', 'value']) ?? item,
        '',
      ),
    )
    .filter(Boolean)
}

const asPriceMatrix = (input: unknown): string[][] => {
  if (!Array.isArray(input)) return []
  return input.map((row) => {
    if (!Array.isArray(row)) return []
    return row.map((cell) => {
      const raw = unwrapValue(
        pick(cell, ['Price_e', 'Price', 'price', 'value']) ?? cell,
      )
      return String(raw ?? '').trim()
    })
  })
}

type PriceEntry = {
  productId?: string
  gradeId?: string
  priceGroupId?: string
  price: string
}

type PriceBank = {
  fcPriceSetId: string
  fcPriceGroupIds: string[]
  fcGradeIds: string[]
  fcPriceGroups: string[][]
  fcPriceSetDateAndTime?: string
  userId?: string
}

const extractEntries = (payload: Record<string, unknown>): PriceEntry[] => {
  const listCandidates = [
    payload.entries,
    payload.gradePrices,
    payload.prices,
    payload.items,
  ]

  for (const candidate of listCandidates) {
    if (!Array.isArray(candidate)) continue
    const entries: PriceEntry[] = []

    for (const item of candidate) {
      if (!item || typeof item !== 'object') continue
      const obj = item as Record<string, unknown>
      const rawPrice =
        obj.price ?? obj.price_e ?? obj.pricePerLiter ?? obj.amount ?? obj.value
      if (rawPrice == null) continue

      entries.push({
        productId:
          obj.productId != null ? toId2String(obj.productId, '') : undefined,
        gradeId:
          obj.gradeId != null
            ? toId2String(obj.gradeId ?? obj.fcGradeId, '')
            : obj.fcGradeId != null
              ? toId2String(obj.fcGradeId, '')
              : undefined,
        priceGroupId:
          obj.priceGroupId != null
            ? toId2String(obj.priceGroupId ?? obj.fcPriceGroupId, '')
            : obj.fcPriceGroupId != null
              ? toId2String(obj.fcPriceGroupId, '')
              : undefined,
        price: normalizePriceValue(rawPrice),
      })
    }

    if (entries.length) return entries
  }

  const rawPrice =
    payload.price ??
    payload.price_e ??
    payload.pricePerLiter ??
    payload.amount ??
    payload.value
  if (rawPrice != null) {
    return [
      {
        productId:
          payload.productId != null
            ? toId2String(payload.productId, '')
            : undefined,
        gradeId:
          payload.gradeId != null
            ? toId2String(payload.gradeId ?? payload.fcGradeId, '')
            : payload.fcGradeId != null
              ? toId2String(payload.fcGradeId, '')
              : undefined,
        priceGroupId:
          payload.priceGroupId != null
            ? toId2String(payload.priceGroupId ?? payload.fcPriceGroupId, '')
            : payload.fcPriceGroupId != null
              ? toId2String(payload.fcPriceGroupId, '')
              : undefined,
        price: normalizePriceValue(rawPrice),
      },
    ]
  }

  return []
}

const extractExplicitPriceBank = (
  payload: Record<string, unknown>,
): PriceBank | null => {
  const fcPriceSetId = toId2String(
    payload.fcPriceSetId ?? payload.FcPriceSetId,
    '',
  )
  const fcPriceGroupIds = asIdList(
    payload.fcPriceGroupIds ?? payload.FcPriceGroupId,
  )
  const fcGradeIds = asIdList(payload.fcGradeIds ?? payload.FcGradeId)
  const fcPriceGroups = asPriceMatrix(
    payload.fcPriceGroups ?? payload.FcPriceGroups,
  )

  if (
    !fcPriceSetId ||
    !fcPriceGroupIds.length ||
    !fcGradeIds.length ||
    !fcPriceGroups.length
  ) {
    return null
  }

  return {
    fcPriceSetId,
    fcPriceGroupIds,
    fcGradeIds,
    fcPriceGroups,
    fcPriceSetDateAndTime:
      String(
        payload.fcPriceSetDateAndTime ??
          payload.FcPriceSetDateAndTime ??
          payload.PriceSetActivationDateAndTime ??
          '',
      ).trim() || undefined,
    userId: String(payload.userId ?? payload.UserId ?? '').trim() || undefined,
  }
}

const toPriceBank = (response: any): PriceBank | null => {
  const data = toRequestData(response)
  const fcPriceSetId = toId2String(
    pick(data, ['FcPriceSetId', 'fcPriceSetId', 'priceSetId']),
    '',
  )
  const fcPriceGroupIds = asIdList(
    pick(data, ['FcPriceGroupId', 'fcPriceGroupId', 'priceGroups']),
  )
  const fcGradeIds = asIdList(pick(data, ['FcGradeId', 'fcGradeId', 'grades']))
  const fcPriceGroups = asPriceMatrix(
    pick(data, ['FcPriceGroups', 'fcPriceGroups', 'Price', 'prices', 'Prices']),
  )

  if (
    !fcPriceSetId ||
    !fcPriceGroupIds.length ||
    !fcGradeIds.length ||
    !fcPriceGroups.length
  ) {
    return null
  }

  return {
    fcPriceSetId,
    fcPriceGroupIds,
    fcGradeIds,
    fcPriceGroups,
    fcPriceSetDateAndTime:
      String(
        pick(data, [
          'FcPriceSetDateAndTime',
          'fcPriceSetDateAndTime',
          'PriceSetActivationDateAndTime',
        ]) ?? '',
      ).trim() || undefined,
    userId: String(pick(data, ['UserId', 'userId']) ?? '').trim() || undefined,
  }
}

const extractPendingPriceSets = (response: any) => {
  const data = toRequestData(response)
  const pending = pick(data, [
    'FcPendingPriceSet',
    'fcPendingPriceSet',
    'pending',
  ])
  if (!Array.isArray(pending))
    return [] as Array<{ fcPriceSetId: string; activationAt: string }>

  return pending
    .map((item) => {
      const fcPriceSetId = toId2String(
        pick(item, ['FcPriceSetId', 'fcPriceSetId', 'priceSetId']),
        '',
      )
      const activationAt = String(
        pick(item, [
          'PriceSetActivationDateAndTime',
          'priceSetActivationDateAndTime',
          'activationAt',
        ]) ?? '',
      ).trim()
      if (!fcPriceSetId || !activationAt) return null
      return { fcPriceSetId, activationAt }
    })
    .filter(
      (
        item,
      ): item is {
        fcPriceSetId: string
        activationAt: string
      } => Boolean(item),
    )
}

function resolvePumpNozzle(payload: Record<string, unknown>) {
  const pumpId = toInt(
    payload.pumpNumber ?? payload.pumpId ?? payload.fpId ?? payload.FpId,
    1,
  )
  const nozzleId = toInt(
    payload.nozzleNumber ??
      payload.nozzleId ??
      payload.nozzle ??
      payload.NozzleNumber,
    1,
  )
  return { pumpId, nozzleId }
}

async function requestWithTimeout(
  client: any,
  message: any,
  timeoutMs: number,
  timeoutMessage: string,
) {
  return await Promise.race([
    client.request(message, { timeoutMs }),
    timeout<any>(timeoutMs, timeoutMessage),
  ])
}

function getProtocolErrorText(error: any) {
  const rejectInfoText = String(
    error?.data?.RejectInfoText ??
      error?.data?.rejectInfoText ??
      error?.payload?.data?.RejectInfoText ??
      error?.payload?.data?.rejectInfoText ??
      '',
  ).trim()
  const message = String(error?.message ?? error ?? '').trim()
  return [message, rejectInfoText].filter(Boolean).join(' | ')
}

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

function rememberGatewaySnapshot(
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
        'tgId',
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

async function readFpStatus(
  client: any,
  timeoutMs: number,
  fpId: string,
  preferredSubCode?: string,
) {
  const variants = buildFpStatusSubCodePreference(preferredSubCode).map(
    (subCode) => ({ subCode, data: { FpId: fpId } }),
  )
  const result = await requestWithSubCodeFallback(client, {
    name: 'FpStatus_req',
    variants,
    timeoutMs,
    timeoutMessage: `Timed out requesting fuelling point status for ${fpId}`,
  })
  return {
    ...result,
    normalized: rememberGatewaySnapshot(
      'FpStatus_resp',
      result.response,
      result.usedSubCode,
    ),
  }
}

async function readFpInfo(
  client: any,
  timeoutMs: number,
  fpId: string,
  fpInfoParId?: string[],
) {
  const result = await requestWithSubCodeFallback(client, {
    name: 'FpInfo_req',
    variants: [
      {
        subCode: '01H',
        data: {
          FpId: fpId,
          ...(fpInfoParId?.length ? { FpInfoParId: fpInfoParId } : {}),
        },
      },
    ],
    timeoutMs,
    timeoutMessage: `Timed out requesting fuelling point info for ${fpId}`,
  })
  return {
    ...result,
    normalized: rememberGatewaySnapshot(
      'FpInfo_resp',
      result.response,
      result.usedSubCode,
    ),
  }
}

async function readFpFuellingData(
  client: any,
  timeoutMs: number,
  fpId: string,
  preferredSubCode?: string,
) {
  const requested = String(preferredSubCode ?? '01H')
    .trim()
    .toUpperCase()
  const variants = [requested, '01H', '00H']
    .filter((value, index, list) => list.indexOf(value) === index)
    .map((subCode) => ({ subCode, data: { FpId: fpId } }))
  const result = await requestWithSubCodeFallback(client, {
    name: 'FpFuellingData_req',
    variants,
    timeoutMs,
    timeoutMessage: `Timed out requesting fuelling data for ${fpId}`,
  })
  return {
    ...result,
    normalized: rememberGatewaySnapshot(
      'FpFuellingData_resp',
      result.response,
      result.usedSubCode,
    ),
  }
}

async function readFpError(client: any, timeoutMs: number, fpId: string) {
  const result = await requestWithSubCodeFallback(client, {
    name: 'FpErrorMsg_req',
    variants: [{ subCode: '00H', data: { FpId: fpId } }],
    timeoutMs,
    timeoutMessage: `Timed out requesting fuelling point error for ${fpId}`,
  })
  return {
    ...result,
    normalized: rememberGatewaySnapshot(
      'FpErrorMsg_resp',
      result.response,
      result.usedSubCode,
    ),
  }
}

async function readTgStatus(
  client: any,
  timeoutMs: number,
  tgId: string,
  preferredSubCode?: string,
) {
  const requested = String(preferredSubCode ?? '01H')
    .trim()
    .toUpperCase()
  const variants = [requested, '01H', '00H']
    .filter((value, index, list) => list.indexOf(value) === index)
    .map((subCode) => ({ subCode, data: { TgId: tgId } }))
  const result = await requestWithSubCodeFallback(client, {
    name: 'TgStatus_req',
    variants,
    timeoutMs,
    timeoutMessage: `Timed out requesting tank gauge status for ${tgId}`,
  })
  return {
    ...result,
    normalized: rememberGatewaySnapshot(
      'TgStatus_resp',
      result.response,
      result.usedSubCode,
    ),
  }
}

async function readSiteDeliveryStatus(
  client: any,
  timeoutMs: number,
  preferredSubCode?: string,
) {
  const requested = String(preferredSubCode ?? '01H')
    .trim()
    .toUpperCase()
  const variants = [requested, '01H', '00H']
    .filter((value, index, list) => list.indexOf(value) === index)
    .map((subCode) => ({ subCode, data: {} }))
  const result = await requestWithSubCodeFallback(client, {
    name: 'SiteDeliveryStatus_req',
    variants,
    timeoutMs,
    timeoutMessage: 'Timed out requesting site delivery status',
  })
  return {
    ...result,
    normalized: rememberGatewaySnapshot(
      'SiteDeliveryStatus_resp',
      result.response,
      result.usedSubCode,
    ),
  }
}

async function readTankDeliveryData(
  client: any,
  timeoutMs: number,
  tgId: string,
  posId: string,
  itemIds?: string[],
) {
  const result = await requestWithSubCodeFallback(client, {
    name: 'TankDeliveryData_req',
    variants: [
      {
        subCode: '00H',
        data: {
          TgId: tgId,
          PosId: posId,
          ZERO: 1,
          TankDeliveryDataItemId: itemIds?.length
            ? itemIds
            : ALL_TANK_DELIVERY_ITEM_IDS,
        },
      },
    ],
    timeoutMs,
    timeoutMessage: `Timed out requesting tank delivery data for ${tgId}`,
  })
  return {
    ...result,
    normalized: rememberGatewaySnapshot(
      'TankDeliveryData_resp',
      result.response,
      result.usedSubCode,
    ),
  }
}

async function clearTankDeliveryData(
  client: any,
  timeoutMs: number,
  payload: Record<string, unknown>,
) {
  return await requestWithSubCodeFallback(client, {
    name: 'clear_TankDeliveryData_req',
    variants: [{ subCode: '00H', data: payload }],
    timeoutMs,
    timeoutMessage: 'Timed out clearing tank delivery data',
  })
}

async function sendSimpleWetstockCommand(
  client: any,
  timeoutMs: number,
  action: string,
  payload: Record<string, unknown>,
  timeoutMessage: string,
) {
  const request = buildJplCommandRequest(action, payload)
  if (!request) throw new Error(`Unable to build ${action} request`)
  const response = await requestWithTimeout(
    client,
    request,
    timeoutMs,
    timeoutMessage,
  )
  return { request, response }
}

function isUnknownSubCodeError(
  error: any,
  messageName: string,
  subCode: string,
) {
  const info = getProtocolErrorText(error).toLowerCase()
  return (
    (info.includes(messageName.toLowerCase()) &&
      info.includes(`subcode "${subCode.toLowerCase()}"`) &&
      info.includes('unknown')) ||
    (info.includes(messageName.toLowerCase()) &&
      info.includes(`subcode '${subCode.toLowerCase()}'`) &&
      info.includes('unknown')) ||
    (info.includes(messageName.toLowerCase()) &&
      info.includes(subCode.toLowerCase()) &&
      info.includes('unknown message')) ||
    (info.includes(messageName.toLowerCase()) &&
      info.includes(subCode.toLowerCase()) &&
      info.includes('closest matching'))
  )
}

async function requestWithSubCodeFallback(
  client: any,
  options: {
    name: string
    variants: Array<{ subCode: string; data: Record<string, unknown> }>
    timeoutMs: number
    timeoutMessage: string
  },
) {
  let lastError: any = null

  for (const variant of options.variants) {
    try {
      const response = await requestWithTimeout(
        client,
        {
          name: options.name,
          subCode: variant.subCode,
          data: variant.data,
        },
        options.timeoutMs,
        options.timeoutMessage,
      )
      return { response, usedSubCode: variant.subCode }
    } catch (error: any) {
      lastError = error
      if (!isUnknownSubCodeError(error, options.name, variant.subCode)) {
        logger.error('[jpl]', {
          msg: 'request failed',
          name: options.name,
          subCode: variant.subCode,
          error: getProtocolErrorText(error),
        })
        throw error
      }

      logger.warn('[jpl]', {
        msg: 'subCode unsupported; trying fallback',
        name: options.name,
        subCode: variant.subCode,
        error: getProtocolErrorText(error),
      })
    }
  }

  throw lastError ?? new Error(`No supported subCode found for ${options.name}`)
}

async function readFcStatus(client: any, timeoutMs: number) {
  return await requestWithSubCodeFallback(client, {
    name: 'FcStatus_req',
    variants: [{ subCode: '00H', data: {} }],
    timeoutMs,
    timeoutMessage: 'Timed out requesting forecourt controller status',
  })
}

async function readPosConnectionStatus(client: any, timeoutMs: number) {
  return await requestWithSubCodeFallback(client, {
    name: 'PosConnectionStatus_req',
    variants: [{ subCode: '00H', data: {} }],
    timeoutMs,
    timeoutMessage: 'Timed out requesting POS connection status',
  })
}

async function readPssPeripheralsStatus(client: any, timeoutMs: number) {
  return await requestWithSubCodeFallback(client, {
    name: 'PssPeripheralsStatus_req',
    variants: [{ subCode: '00H', data: {} }],
    timeoutMs,
    timeoutMessage: 'Timed out requesting PSS peripherals status',
  })
}

async function readFcServiceMessage(client: any, timeoutMs: number) {
  return await requestWithSubCodeFallback(client, {
    name: 'FcServiceMsg_req',
    variants: [{ subCode: '00H', data: {} }],
    timeoutMs,
    timeoutMessage: 'Timed out requesting forecourt service log message',
  })
}

async function clearFcServiceMessage(
  client: any,
  timeoutMs: number,
  seqNo: string,
) {
  return await requestWithSubCodeFallback(client, {
    name: 'clear_FcServiceMsg_req',
    variants: [{ subCode: '00H', data: { FcServiceMsgSeqNo: seqNo } }],
    timeoutMs,
    timeoutMessage: 'Timed out clearing forecourt service log message',
  })
}

function normalizeBackOfficeRecordResponse(response: any, usedSubCode: string) {
  const payload = toResponseEnvelopeData(response) ?? {}
  return {
    usedSubCode,
    seqNo: payload?.BorSeqNo != null ? String(payload.BorSeqNo) : undefined,
    formatId:
      String(
        payload?.BorFormatId?.value ?? payload?.BorFormatId ?? '',
      ).trim() || undefined,
    payload,
  }
}

async function readBackOfficeRecord(
  client: any,
  timeoutMs: number,
  preferredSubCode?: string,
) {
  const requested = String(
    preferredSubCode ?? process.env.JPL_BACK_OFFICE_RECORD_SUBCODE ?? '02H',
  )
    .trim()
    .toUpperCase()
  const variants = [requested, '02H', '01H', '00H']
    .filter((value, index, list) => list.indexOf(value) === index)
    .map((subCode) => ({ subCode, data: {} }))

  const result = await requestWithSubCodeFallback(client, {
    name: 'BackOfficeRecord_req',
    variants,
    timeoutMs,
    timeoutMessage: 'Timed out requesting back office record',
  })

  return {
    ...result,
    normalized: normalizeBackOfficeRecordResponse(
      result.response,
      result.usedSubCode,
    ),
  }
}

async function clearBackOfficeRecord(
  client: any,
  timeoutMs: number,
  seqNo: string,
) {
  return await requestWithSubCodeFallback(client, {
    name: 'clear_BackOfficeRecord_req',
    variants: [{ subCode: '00H', data: { BorSeqNo: seqNo } }],
    timeoutMs,
    timeoutMessage: 'Timed out clearing back office record',
  })
}

async function readPriceSetStatus(client: any, timeoutMs: number) {
  const result = await requestWithSubCodeFallback(client, {
    name: 'FcPriceSetStatus_req',
    variants: [
      { subCode: '01H', data: {} },
      { subCode: '00H', data: {} },
    ],
    timeoutMs,
    timeoutMessage: 'Timed out requesting price set status',
  })

  return {
    ...result,
    supportsPendingQueue: result.usedSubCode === '01H',
  }
}

async function readCurrentPriceSet(client: any, timeoutMs: number) {
  return await requestWithSubCodeFallback(client, {
    name: 'FcPriceSet_req',
    variants: [
      {
        subCode: '04H',
        data: {
          PriceSetType: CURRENT_PRICE_SET_TYPE,
          FcPriceSetId: ID_ZERO,
          PriceSetActivationDateAndTime: ZERO_FC_DATE_TIME,
        },
      },
      {
        subCode: '03H',
        data: {
          PriceSetType: CURRENT_PRICE_SET_TYPE,
        },
      },
      {
        subCode: '02H',
        data: {
          PriceSetType: CURRENT_PRICE_SET_TYPE,
        },
      },
    ],
    timeoutMs,
    timeoutMessage: 'Timed out requesting current price set',
  })
}

async function readSpecificPriceSet(
  client: any,
  timeoutMs: number,
  fcPriceSetId: string,
  activationAt: string,
) {
  return await requestWithSubCodeFallback(client, {
    name: 'FcPriceSet_req',
    variants: [
      {
        subCode: '04H',
        data: {
          PriceSetType: PENDING_PRICE_SET_TYPE,
          FcPriceSetId: fcPriceSetId,
          PriceSetActivationDateAndTime: activationAt,
        },
      },
    ],
    timeoutMs,
    timeoutMessage: 'Timed out requesting pending price set',
  })
}

async function changePriceSet(
  client: any,
  timeoutMs: number,
  payload: {
    userId: string
    fcPriceSetId: string
    fcPriceGroupIds: string[]
    fcGradeIds: string[]
    fcPriceGroups: string[][]
    activationAt: string
  },
) {
  const result = await requestWithSubCodeFallback(client, {
    name: 'change_FcPriceSet_req',
    variants: [
      {
        subCode: '04H',
        data: {
          UserId: payload.userId,
          FcPriceSetId: payload.fcPriceSetId,
          FcPriceGroupId: payload.fcPriceGroupIds,
          FcGradeId: payload.fcGradeIds,
          FcPriceGroups: payload.fcPriceGroups,
          PriceSetActivationDateAndTime: payload.activationAt,
        },
      },
      {
        subCode: '03H',
        data: {
          UserId: payload.userId,
          FcPriceSetId: payload.fcPriceSetId,
          FcPriceGroupId: payload.fcPriceGroupIds,
          FcGradeId: payload.fcGradeIds,
          FcPriceGroups: payload.fcPriceGroups,
          PriceSetActivationDateAndTime: payload.activationAt,
        },
      },
      {
        subCode: '02H',
        data: {
          FcPriceSetId: payload.fcPriceSetId,
          FcPriceGroupId: payload.fcPriceGroupIds,
          FcGradeId: payload.fcGradeIds,
          FcPriceGroups: payload.fcPriceGroups,
          PriceSetActivationDateAndTime: payload.activationAt,
        },
      },
    ],
    timeoutMs,
    timeoutMessage: 'Timed out scheduling price set change',
  })

  return {
    ...result,
    preservesPendingQueue: result.usedSubCode === '04H',
  }
}

async function clearPendingPriceSet(
  client: any,
  timeoutMs: number,
  fcPriceSetId: string,
  activationAt: string,
) {
  return await requestWithSubCodeFallback(client, {
    name: 'clear_PendingFcPriceSet_req',
    variants: [
      {
        subCode: '00H',
        data: {
          FcPriceSetId: fcPriceSetId,
          PriceSetActivationDateAndTime: activationAt,
        },
      },
    ],
    timeoutMs,
    timeoutMessage: 'Timed out clearing pending price set',
  })
}

const cloneMatrix = (matrix: string[][]) => matrix.map((row) => [...row])

const mergePriceBank = (base: PriceBank, entries: PriceEntry[]): PriceBank => {
  const fcGradeIds = [...base.fcGradeIds]
  const fcPriceGroupIds = [...base.fcPriceGroupIds]
  const fcPriceGroups = cloneMatrix(base.fcPriceGroups)

  while (fcPriceGroups.length < fcPriceGroupIds.length) {
    fcPriceGroups.push(new Array(fcGradeIds.length).fill('0'))
  }
  for (let rowIndex = 0; rowIndex < fcPriceGroups.length; rowIndex++) {
    const row = fcPriceGroups[rowIndex] ?? []
    while (row.length < fcGradeIds.length) row.push('0')
    fcPriceGroups[rowIndex] = row
  }

  for (const entry of entries) {
    const targetGradeId = entry.gradeId || entry.productId
    if (!targetGradeId) {
      throw new Error(
        'Each scheduled price entry must include productId or gradeId',
      )
    }

    const gradeIndex = fcGradeIds.findIndex(
      (gradeId) => gradeId === targetGradeId,
    )
    if (gradeIndex < 0) {
      throw new Error(
        `Grade ${targetGradeId} is not present in the active DOMS price bank`,
      )
    }

    const groupIndexes = entry.priceGroupId
      ? fcPriceGroupIds
          .map((groupId, index) =>
            groupId === entry.priceGroupId ? index : -1,
          )
          .filter((index) => index >= 0)
      : fcPriceGroupIds.map((_, index) => index)

    if (!groupIndexes.length) {
      throw new Error(
        `Price group ${entry.priceGroupId} is not present in the active DOMS price bank`,
      )
    }

    for (const groupIndex of groupIndexes) {
      if (!fcPriceGroups[groupIndex]) {
        fcPriceGroups[groupIndex] = new Array(fcGradeIds.length).fill('0')
      }
      fcPriceGroups[groupIndex][gradeIndex] = entry.price
    }
  }

  return {
    fcPriceSetId: base.fcPriceSetId,
    fcPriceGroupIds,
    fcGradeIds,
    fcPriceGroups,
    fcPriceSetDateAndTime: base.fcPriceSetDateAndTime,
    userId: base.userId,
  }
}

export async function jplHealth(
  stationId: string,
  options: { accessMode?: JplAccessMode } = {},
): Promise<JplHealth> {
  await assertJplAccessAllowedForMode(stationId, options.accessMode ?? 'pos')
  const state = getJplGatewayState()

  const gatewayState: any = getJplGatewayState() as any

  return {
    ok: Boolean(
      gatewayState.apcs?.apc1?.connected && gatewayState.apcs?.apc1?.loggedOn,
    ),
    provider: 'JPL',
    host: String((await getJplConfig(stationId))?.host ?? ''),
    apcs: state.apcs,
    version: gatewayState.version,
    secureMode: gatewayState.secureMode,
    lastMessageAt: gatewayState.lastMessageAt,
    lastHeartbeatAt: gatewayState.lastHeartbeatAt,
    controllerStatus: gatewayState.controllerStatus ?? null,
    posConnectionStatus: gatewayState.posConnectionStatus ?? null,
    peripheralsStatus: gatewayState.peripheralsStatus ?? null,
    installStatus: gatewayState.installStatus ?? null,
    pumpStatuses: gatewayState.pumpStatuses ?? [],
    fpInfo: gatewayState.fpInfo ?? [],
    fuellingData: gatewayState.fuellingData ?? [],
    tankStatuses: gatewayState.tankStatuses ?? [],
    siteDeliveryStatus: gatewayState.siteDeliveryStatus ?? null,
    tankDeliveryData: gatewayState.tankDeliveryData ?? [],
    fpErrors: gatewayState.fpErrors ?? [],
    serviceMessages: gatewayState.serviceMessages ?? [],
    backOfficeRecords: gatewayState.backOfficeRecords ?? [],
    activePumpStatuses: gatewayState.activePumpStatuses ?? [],
    tankAlerts: gatewayState.tankAlerts ?? [],
    controllerFlags: gatewayState.controllerFlags ?? {},
    onlinePeerConnections: gatewayState.onlinePeerConnections ?? [],
    peripheralAlerts: gatewayState.peripheralAlerts ?? [],
    pumpErrorDiagnostics: gatewayState.pumpErrorDiagnostics ?? [],
    replayCapabilities: gatewayState.replayCapabilities ?? undefined,
    error: gatewayState.apcs?.apc1?.connected
      ? undefined
      : 'JPL gateway not started',
  }
}

/**
 * Minimal TCP command support.
 *
 * Notes:
 * - This intentionally supports only a small set of commands to prove the end-to-end
 *   communication path (machine <-> application).
 * - For a richer command surface, add command-specific request builders and
 *   correlation logic (sequence/message IDs) where applicable.
 */
export async function jplSendPosCommand(
  stationId: string,
  cmd: PosCommand,
  options: { accessMode?: JplAccessMode } = {},
): Promise<PosCommandResult> {
  await assertJplAccessAllowedForMode(stationId, options.accessMode ?? 'pos')

  const gw = getJplGatewayState()
  if (!gw.started) {
    try {
      await ensureJplGatewayStarted()
    } catch (e: any) {
      return {
        ok: false,
        accepted: false,
        error: e?.message ?? 'JPL gateway not started',
      }
    }
  }

  const client = getJplClient()
  if (!client) {
    return { ok: false, accepted: false, error: 'APC1 client not available' }
  }

  const cfg = await getJplConfig(stationId)
  const timeoutMs = Number(
    cfg?.timeoutMs ?? process.env.JPL_TIMEOUT_MS ?? 10_000,
  )
  const posId = toId2(Number(cfg?.posId ?? process.env.JPL_POS_ID ?? 1))
  const fpOperationModeNo = Number(
    cfg?.fpOperationModeNo ?? process.env.JPL_FP_OPERATION_MODE_NO ?? 1,
  )

  return await enqueueApc1(async () => {
    try {
      if (cmd.type === 'PING') {
        return {
          ok: true,
          accepted: true,
          data: {
            connected: getJplGatewayState().apcs?.apc1?.connected ?? false,
            loggedOn: getJplGatewayState().apcs?.apc1?.loggedOn ?? false,
          },
        }
      }

      if (cmd.type === 'POS_STATUS') {
        const gatewayState = getJplGatewayState()
        const replayStatus = await getReplayStatusSummary(stationId)
        return {
          ok: true,
          accepted: true,
          data: {
            apcs: gatewayState.apcs,
            connected: gatewayState.apcs?.apc1?.connected ?? false,
            controllerStatus: gatewayState.controllerStatus ?? null,
            posConnectionStatus: gatewayState.posConnectionStatus ?? null,
            peripheralsStatus: gatewayState.peripheralsStatus ?? null,
            installStatus: gatewayState.installStatus ?? null,
            serviceMessages: gatewayState.serviceMessages ?? [],
            backOfficeRecords: gatewayState.backOfficeRecords ?? [],
            controllerFlags: gatewayState.controllerFlags ?? {},
            onlinePeerConnections: gatewayState.onlinePeerConnections ?? [],
            peripheralAlerts: gatewayState.peripheralAlerts ?? [],
            pumpErrorDiagnostics: gatewayState.pumpErrorDiagnostics ?? [],
            replayCapabilities: replayStatus.replayCapabilities,
            pendingReplayClears: replayStatus.pendingReplayClears,
            transactionCheckpoints: replayStatus.transactionCheckpoints ?? [],
            pumpStatuses: gatewayState.pumpStatuses ?? [],
            fpInfo: gatewayState.fpInfo ?? [],
            fuellingData: gatewayState.fuellingData ?? [],
            tankStatuses: gatewayState.tankStatuses ?? [],
            siteDeliveryStatus: gatewayState.siteDeliveryStatus ?? null,
            tankDeliveryData: gatewayState.tankDeliveryData ?? [],
            fpErrors: gatewayState.fpErrors ?? [],
            activePumpStatuses: gatewayState.activePumpStatuses ?? [],
            tankAlerts: gatewayState.tankAlerts ?? [],
            bufferHealth: gatewayState.bufferHealth ?? null,
            bufferAlerts: gatewayState.bufferAlerts ?? [],
          },
        }
      }

      if (cmd.type === 'GET_REPLAY_STATUS') {
        const replayStatus = await getReplayStatusSummary(stationId)
        return { ok: true, accepted: true, data: replayStatus }
      }

      if (cmd.type === 'GET_FC_STATUS') {
        const result = await readFcStatus(client, timeoutMs)
        return { ok: true, accepted: true, data: result }
      }

      if (cmd.type === 'GET_POS_CONNECTION_STATUS') {
        const result = await readPosConnectionStatus(client, timeoutMs)
        return { ok: true, accepted: true, data: result }
      }

      if (cmd.type === 'GET_PSS_PERIPHERALS_STATUS') {
        const result = await readPssPeripheralsStatus(client, timeoutMs)
        return { ok: true, accepted: true, data: result }
      }

      if (cmd.type === 'GET_FC_SERVICE_LOG') {
        const result = await readFcServiceMessage(client, timeoutMs)
        return { ok: true, accepted: true, data: result }
      }

      if (cmd.type === 'CLEAR_FC_SERVICE_LOG') {
        const payload = (cmd as any).payload ?? {}
        const seqNo = String(
          payload?.fcServiceMsgSeqNo ?? payload?.FcServiceMsgSeqNo ?? '',
        ).trim()
        if (!seqNo) {
          throw new Error('FcServiceMsgSeqNo is required')
        }
        const result = await clearFcServiceMessage(client, timeoutMs, seqNo)
        return { ok: true, accepted: true, data: result }
      }

      if (cmd.type === 'GET_BACK_OFFICE_RECORD') {
        const payload = (cmd as any).payload ?? {}
        const preferredSubCode = String(
          payload?.subCode ??
            payload?.SubCode ??
            payload?.preferredSubCode ??
            '',
        ).trim()
        const result = await readBackOfficeRecord(
          client,
          timeoutMs,
          preferredSubCode || undefined,
        )
        return { ok: true, accepted: true, data: result }
      }

      if (cmd.type === 'CLEAR_BACK_OFFICE_RECORD') {
        const payload = (cmd as any).payload ?? {}
        const seqNo = String(
          payload?.borSeqNo ?? payload?.BorSeqNo ?? '',
        ).trim()
        if (!seqNo) {
          throw new Error('BorSeqNo is required')
        }
        const result = await clearBackOfficeRecord(client, timeoutMs, seqNo)
        return { ok: true, accepted: true, data: result }
      }

      if (cmd.type === 'GET_FP_STATUS') {
        const payload = (cmd as any).payload ?? {}
        const fpId = toId2String(
          pick(payload, ['fpId', 'FpId', 'pumpId', 'pumpNumber']),
          ID_ZERO,
        )
        const preferredSubCode = String(
          pick(payload, ['subCode', 'SubCode']) ?? '',
        ).trim()
        const result = await readFpStatus(
          client,
          timeoutMs,
          fpId,
          preferredSubCode || undefined,
        )
        return { ok: true, accepted: true, data: result }
      }

      if (cmd.type === 'GET_FP_INFO') {
        const payload = (cmd as any).payload ?? {}
        const fpId = toId2String(
          pick(payload, ['fpId', 'FpId', 'pumpId', 'pumpNumber']),
          ID_ZERO,
        )
        const fpInfoParId = Array.isArray(
          pick(payload, ['fpInfoParId', 'FpInfoParId']),
        )
          ? (pick(payload, ['fpInfoParId', 'FpInfoParId']) as any[])
              .map((value) => toId2String(value, ''))
              .filter(Boolean)
          : undefined
        const result = await readFpInfo(client, timeoutMs, fpId, fpInfoParId)
        return { ok: true, accepted: true, data: result }
      }

      if (cmd.type === 'GET_FP_FUELLING_DATA') {
        const payload = (cmd as any).payload ?? {}
        const fpId = toId2String(
          pick(payload, ['fpId', 'FpId', 'pumpId', 'pumpNumber']),
          ID_ZERO,
        )
        const preferredSubCode = String(
          pick(payload, ['subCode', 'SubCode']) ?? '',
        ).trim()
        const result = await readFpFuellingData(
          client,
          timeoutMs,
          fpId,
          preferredSubCode || undefined,
        )
        return { ok: true, accepted: true, data: result }
      }

      if (cmd.type === 'GET_FP_ERROR') {
        const payload = (cmd as any).payload ?? {}
        const fpId = toId2String(
          pick(payload, ['fpId', 'FpId', 'pumpId', 'pumpNumber']),
          ID_ZERO,
        )
        const result = await readFpError(client, timeoutMs, fpId)
        return { ok: true, accepted: true, data: result }
      }

      if (cmd.type === 'PRESET_FUEL_AUTH') {
        const payload = (cmd as any).payload ?? {}
        const { pumpId, nozzleId } = resolvePumpNozzle(payload)
        const request = buildJplCommandRequest('PRESET_FUEL_AUTH', {
          ...payload,
          pumpNumber: pumpId,
          posId,
        })
        if (!request)
          throw new Error('Unable to build preset authorize request')
        const response = await requestWithTimeout(
          client,
          request,
          timeoutMs,
          'Timed out sending preset authorize command',
        )
        return {
          ok: true,
          accepted: true,
          data: {
            pumpId,
            nozzleId,
            response,
            ...describeJplAuthorizeRequest('PRESET_FUEL_AUTH', payload),
          },
        }
      }

      if (cmd.type === 'OPEN_TANK_CONTROLLER') {
        const payload = (cmd as any).payload ?? {}
        const tankId = toId2String(
          pick(payload, ['tankId', 'TankId', 'tgId', 'TgId']),
          '',
        )
        if (!tankId) throw new Error('TankId is required')
        const result = await sendSimpleWetstockCommand(
          client,
          timeoutMs,
          'OPEN_TANK_CONTROLLER',
          { ...payload, tankId, posId },
          `Timed out opening tank controller ${tankId}`,
        )
        return {
          ok: true,
          accepted: true,
          data: { tankId, response: result.response },
        }
      }

      if (cmd.type === 'CLOSE_TANK_CONTROLLER') {
        const payload = (cmd as any).payload ?? {}
        const tankId = toId2String(
          pick(payload, ['tankId', 'TankId', 'tgId', 'TgId']),
          ID_ZERO,
        )
        const result = await sendSimpleWetstockCommand(
          client,
          timeoutMs,
          'CLOSE_TANK_CONTROLLER',
          { ...payload, tankId },
          `Timed out closing tank controller ${tankId}`,
        )
        return {
          ok: true,
          accepted: true,
          data: { tankId, response: result.response },
        }
      }

      if (cmd.type === 'START_DELIVERY_PROCESS') {
        const payload = (cmd as any).payload ?? {}
        const tankId = toId2String(pick(payload, ['tankId', 'TankId']), '')
        if (!tankId) throw new Error('TankId is required')
        const result = await sendSimpleWetstockCommand(
          client,
          timeoutMs,
          'START_DELIVERY_PROCESS',
          { ...payload, tankId, posId },
          `Timed out starting delivery process for tank ${tankId}`,
        )
        return {
          ok: true,
          accepted: true,
          data: { tankId, response: result.response },
        }
      }

      if (cmd.type === 'STOP_DELIVERY_PROCESS') {
        const payload = (cmd as any).payload ?? {}
        const tankId = toId2String(pick(payload, ['tankId', 'TankId']), '')
        if (!tankId) throw new Error('TankId is required')
        const result = await sendSimpleWetstockCommand(
          client,
          timeoutMs,
          'STOP_DELIVERY_PROCESS',
          { ...payload, tankId, posId },
          `Timed out stopping delivery process for tank ${tankId}`,
        )
        return {
          ok: true,
          accepted: true,
          data: { tankId, response: result.response },
        }
      }

      if (cmd.type === 'GET_TG_STATUS') {
        const payload = (cmd as any).payload ?? {}
        const tgId = toId2String(
          pick(payload, ['tgId', 'TgId', 'tankId', 'TankId']),
          ID_ZERO,
        )
        const preferredSubCode = String(
          pick(payload, ['subCode', 'SubCode']) ?? '',
        ).trim()
        const result = await readTgStatus(
          client,
          timeoutMs,
          tgId,
          preferredSubCode || undefined,
        )
        return { ok: true, accepted: true, data: result }
      }

      if (cmd.type === 'GET_TRANSACTION_BUFFER_STATUS') {
        const gatewayState = getJplGatewayState()
        return {
          ok: true,
          accepted: true,
          data: {
            bufferHealth: gatewayState.bufferHealth ?? null,
            bufferAlerts: gatewayState.bufferAlerts ?? [],
          },
        }
      }

      if (cmd.type === 'EXTENDED_FUEL_AUTH') {
        const payload = (cmd as any).payload ?? {}
        const { pumpId, nozzleId } = resolvePumpNozzle(payload)
        const request = buildJplCommandRequest('EXTENDED_FUEL_AUTH', {
          ...payload,
          pumpNumber: pumpId,
          posId,
        })
        if (!request)
          throw new Error('Unable to build extended authorize request')
        const response = await requestWithTimeout(
          client,
          request,
          timeoutMs,
          'Timed out sending extended authorize command',
        )
        return {
          ok: true,
          accepted: true,
          data: {
            pumpId,
            nozzleId,
            response,
            ...describeJplAuthorizeRequest('EXTENDED_FUEL_AUTH', payload),
          },
        }
      }

      if (cmd.type === 'PREPARE_TRANSACTION') {
        const payload = (cmd as any).payload ?? {}
        const { pumpId, nozzleId } = resolvePumpNozzle(payload)
        const request = buildJplCommandRequest('PREPARE_TRANSACTION', {
          ...payload,
          pumpNumber: pumpId,
          posId,
        })
        if (!request)
          throw new Error('Unable to build prepare transaction request')
        const response = await requestWithTimeout(
          client,
          request,
          timeoutMs,
          'Timed out sending prepare transaction command',
        )
        return {
          ok: true,
          accepted: true,
          data: {
            pumpId,
            nozzleId,
            response,
            ...describeJplAuthorizeRequest('PREPARE_TRANSACTION', payload),
          },
        }
      }

      if (cmd.type === 'GET_SITE_DELIVERY_STATUS') {
        const payload = (cmd as any).payload ?? {}
        const preferredSubCode = String(
          pick(payload, ['subCode', 'SubCode']) ?? '',
        ).trim()
        const result = await readSiteDeliveryStatus(
          client,
          timeoutMs,
          preferredSubCode || undefined,
        )
        return { ok: true, accepted: true, data: result }
      }

      if (cmd.type === 'GET_TANK_DELIVERY_DATA') {
        const payload = (cmd as any).payload ?? {}
        const tgId = toId2String(
          pick(payload, ['tgId', 'TgId', 'tankId', 'TankId']),
          '',
        )
        if (!tgId) {
          throw new Error('TgId is required')
        }
        const itemIds = Array.isArray(
          pick(payload, ['tankDeliveryDataItemId', 'TankDeliveryDataItemId']),
        )
          ? (
              pick(payload, [
                'tankDeliveryDataItemId',
                'TankDeliveryDataItemId',
              ]) as any[]
            )
              .map((value) => toId2String(value, ''))
              .filter(Boolean)
          : undefined
        const requestPosId = toId2String(
          pick(payload, ['posId', 'PosId']),
          posId,
        )
        const result = await readTankDeliveryData(
          client,
          timeoutMs,
          tgId,
          requestPosId,
          itemIds,
        )
        return { ok: true, accepted: true, data: result }
      }

      if (cmd.type === 'CLEAR_TANK_DELIVERY_DATA') {
        const payload = (cmd as any).payload ?? {}
        const requestPosId = toId2String(
          pick(payload, ['posId', 'PosId']),
          posId,
        )
        const deliveryReportSeqNo = String(
          pick(payload, ['deliveryReportSeqNo', 'DeliveryReportSeqNo']) ?? '0',
        ).trim()
        const tankDeliveries = Array.isArray(
          pick(payload, ['tankDeliveries', 'TankDeliveries']),
        )
          ? (pick(payload, ['tankDeliveries', 'TankDeliveries']) as any[])
              .map((entry) => ({
                TgId: toId2String(pick(entry, ['tgId', 'TgId']), ''),
                TankDeliverySeqNo: toId2String(
                  pick(entry, ['tankDeliverySeqNo', 'TankDeliverySeqNo']),
                  '',
                ),
              }))
              .filter((entry) => entry.TgId && entry.TankDeliverySeqNo)
          : []
        const result = await clearTankDeliveryData(client, timeoutMs, {
          PosId: requestPosId,
          DeliveryReportSeqNo: deliveryReportSeqNo || '0',
          ...(tankDeliveries.length ? { TankDeliveries: tankDeliveries } : {}),
        })
        return { ok: true, accepted: true, data: result }
      }

      if (cmd.type === 'GET_SUPERVISED_TRANSACTION') {
        const payload = (cmd as any).payload ?? {}
        const { pumpId } = resolvePumpNozzle(payload)
        const request = buildReadSupervisedTransactionRequest({
          fpId: pumpId,
          posId: pick(payload, ['posId', 'PosId']) ?? ID_ZERO,
          transSeqNo: pick(payload, ['transSeqNo', 'TransSeqNo']),
          transParId: resolveTransactionParIds(payload),
        })
        const response = await requestWithTimeout(
          client,
          request,
          timeoutMs,
          'Timed out reading supervised transaction',
        )
        const core = extractTransactionCore(response)
        return {
          ok: true,
          accepted: true,
          data: { response, fpId: core.fpId, transSeqNo: core.transSeqNo },
        }
      }

      if (cmd.type === 'UNLOCK_SUPERVISED_TRANSACTION') {
        const payload = (cmd as any).payload ?? {}
        const { pumpId } = resolvePumpNozzle(payload)
        const request = buildUnlockSupervisedTransactionRequest({
          fpId: pumpId,
          posId: pick(payload, ['posId', 'PosId']) ?? posId,
          transSeqNo: pick(payload, ['transSeqNo', 'TransSeqNo']),
        })
        const response = await requestWithTimeout(
          client,
          request,
          timeoutMs,
          'Timed out unlocking supervised transaction',
        )
        return { ok: true, accepted: true, data: { response } }
      }

      if (cmd.type === 'CLEAR_SUPERVISED_TRANSACTION') {
        const payload = (cmd as any).payload ?? {}
        const txData = pick(payload, ['transaction', 'txData', 'response'])
        const core = extractTransactionCore(txData ?? payload)
        const { pumpId } = resolvePumpNozzle({
          ...payload,
          pumpNumber: Number(
            core.fpId ?? pick(payload, ['pumpNumber', 'fpId', 'FpId']) ?? 0,
          ),
        })
        const request = buildClearSupervisedTransactionRequest({
          fpId: core.fpId ?? pumpId,
          posId: pick(payload, ['posId', 'PosId']) ?? posId,
          transSeqNo:
            core.transSeqNo ?? pick(payload, ['transSeqNo', 'TransSeqNo']),
          txData,
          payload,
        })
        const response = await requestWithTimeout(
          client,
          request,
          timeoutMs,
          'Timed out clearing supervised transaction',
        )
        return {
          ok: true,
          accepted: true,
          data: {
            response,
            fpId: core.fpId ?? toId2(pumpId),
            transSeqNo:
              core.transSeqNo ??
              String(pick(payload, ['transSeqNo', 'TransSeqNo']) ?? '')
                .trim()
                .padStart(4, '0'),
          },
        }
      }

      if (cmd.type === 'GET_UNSUPERVISED_TRANSACTION') {
        const payload = (cmd as any).payload ?? {}
        const { pumpId } = resolvePumpNozzle(payload)
        const request = buildReadUnsupervisedTransactionRequest({
          fpId: pumpId,
          posId: pick(payload, ['posId', 'PosId']) ?? ID_ZERO,
          transSeqNo: pick(payload, ['transSeqNo', 'TransSeqNo']),
          transParId: resolveTransactionParIds(payload),
        })
        const response = await requestWithTimeout(
          client,
          request,
          timeoutMs,
          'Timed out reading unsupervised transaction',
        )
        const core = extractTransactionCore(response)
        return {
          ok: true,
          accepted: true,
          data: { response, fpId: core.fpId, transSeqNo: core.transSeqNo },
        }
      }

      if (cmd.type === 'UNLOCK_UNSUPERVISED_TRANSACTION') {
        const payload = (cmd as any).payload ?? {}
        const { pumpId } = resolvePumpNozzle(payload)
        const request = buildUnlockUnsupervisedTransactionRequest({
          fpId: pumpId,
          posId: pick(payload, ['posId', 'PosId']) ?? posId,
          transSeqNo: pick(payload, ['transSeqNo', 'TransSeqNo']),
        })
        const response = await requestWithTimeout(
          client,
          request,
          timeoutMs,
          'Timed out unlocking unsupervised transaction',
        )
        return { ok: true, accepted: true, data: { response } }
      }

      if (cmd.type === 'CLEAR_UNSUPERVISED_TRANSACTION') {
        const payload = (cmd as any).payload ?? {}
        const txData = pick(payload, ['transaction', 'txData', 'response'])
        const core = extractTransactionCore(txData ?? payload)
        const { pumpId } = resolvePumpNozzle({
          ...payload,
          pumpNumber: Number(
            core.fpId ?? pick(payload, ['pumpNumber', 'fpId', 'FpId']) ?? 0,
          ),
        })
        const request = buildClearUnsupervisedTransactionRequest({
          fpId: core.fpId ?? pumpId,
          posId: pick(payload, ['posId', 'PosId']) ?? posId,
          transSeqNo:
            core.transSeqNo ?? pick(payload, ['transSeqNo', 'TransSeqNo']),
          txData,
          payload,
        })
        const response = await requestWithTimeout(
          client,
          request,
          timeoutMs,
          'Timed out clearing unsupervised transaction',
        )
        return {
          ok: true,
          accepted: true,
          data: {
            response,
            fpId: core.fpId ?? toId2(pumpId),
            transSeqNo:
              core.transSeqNo ??
              String(pick(payload, ['transSeqNo', 'TransSeqNo']) ?? '')
                .trim()
                .padStart(4, '0'),
          },
        }
      }

      if (cmd.type === 'OPEN_FPS') {
        const payload = (cmd as any).payload ?? {}
        const { pumpId, nozzleId } = resolvePumpNozzle(payload)
        await requestWithTimeout(
          client,
          {
            name: 'open_Fp_req',
            subCode: '00H',
            data: {
              FpId: toId2(pumpId),
              PosId: posId,
              FpOperationModeNo: toInt(
                pick(payload, ['fpOperationModeNo', 'FpOperationModeNo']),
                fpOperationModeNo,
              ),
            },
          },
          timeoutMs,
          'Timed out sending open command',
        )
        return { ok: true, accepted: true, data: { pumpId, nozzleId } }
      }

      if (cmd.type === 'ATTENDANT_AUTH' || cmd.type === 'PREFUEL_CUSTOMER') {
        const payload = (cmd as any).payload ?? {}
        const { pumpId, nozzleId } = resolvePumpNozzle(payload)
        await requestWithTimeout(
          client,
          {
            name: 'authorize_Fp_req',
            subCode: '00H',
            data: { FpId: toId2(pumpId), PosId: posId },
          },
          timeoutMs,
          'Timed out sending authorize command',
        )
        return {
          ok: true,
          accepted: true,
          data: {
            pumpId,
            nozzleId,
            ...describeJplAuthorizeRequest('AUTHORIZE_FP', payload),
          },
        }
      }

      if (cmd.type === 'CLOSE_FPS') {
        const payload = (cmd as any).payload ?? {}
        const { pumpId } = resolvePumpNozzle(payload)
        await requestWithTimeout(
          client,
          {
            name: 'close_Fp_req',
            subCode: '00H',
            data: { FpId: toId2(pumpId), PosId: posId },
          },
          timeoutMs,
          'Timed out sending close command',
        )
        return { ok: true, accepted: true, data: { pumpId } }
      }

      if (
        cmd.type === 'CLEAR_PREFUEL_CUSTOMER' ||
        cmd.type === 'CANCEL_TRANSACTION'
      ) {
        const payload = (cmd as any).payload ?? {}
        const { pumpId } = resolvePumpNozzle(payload)
        await requestWithTimeout(
          client,
          {
            name: 'cancel_FpAuth_req',
            subCode: '00H',
            data: { FpId: toId2(pumpId), PosId: posId },
          },
          timeoutMs,
          'Timed out sending cancel auth command',
        )
        return { ok: true, accepted: true, data: { pumpId } }
      }

      if (cmd.type === 'ESTOP_FP') {
        const payload = (cmd as any).payload ?? {}
        const { pumpId } = resolvePumpNozzle(payload)
        await requestWithTimeout(
          client,
          {
            name: 'estop_Fp_req',
            subCode: '00H',
            data: {
              FpId: toId2(pumpId),
              PosId: toId2String(pick(payload, ['posId', 'PosId']), posId),
            },
          },
          timeoutMs,
          'Timed out sending estop command',
        )
        return { ok: true, accepted: true, data: { pumpId } }
      }

      if (cmd.type === 'CANCEL_FP_ESTOP') {
        const payload = (cmd as any).payload ?? {}
        const { pumpId } = resolvePumpNozzle(payload)
        await requestWithTimeout(
          client,
          {
            name: 'cancel_FpEstop_req',
            subCode: '00H',
            data: {
              FpId: toId2(pumpId),
              PosId: toId2String(pick(payload, ['posId', 'PosId']), posId),
            },
          },
          timeoutMs,
          'Timed out sending cancel estop command',
        )
        return { ok: true, accepted: true, data: { pumpId } }
      }

      if (cmd.type === 'RESET_FP') {
        const payload = (cmd as any).payload ?? {}
        const { pumpId } = resolvePumpNozzle(payload)
        await requestWithTimeout(
          client,
          {
            name: 'reset_Fp_req',
            subCode: '00H',
            data: { FpId: toId2(pumpId) },
          },
          timeoutMs,
          'Timed out sending reset pump command',
        )
        return { ok: true, accepted: true, data: { pumpId } }
      }

      if (cmd.type === 'CLEAR_FP_ERROR') {
        const payload = (cmd as any).payload ?? {}
        const { pumpId } = resolvePumpNozzle(payload)
        await requestWithTimeout(
          client,
          {
            name: 'clear_FpError_req',
            subCode: '00H',
            data: {
              FpId: toId2(pumpId),
              FpErrorCode: String(
                pick(payload, ['fpErrorCode', 'FpErrorCode']) ?? '00',
              ).padStart(2, '0'),
            },
          },
          timeoutMs,
          'Timed out sending clear error command',
        )
        return { ok: true, accepted: true, data: { pumpId } }
      }

      if (cmd.type === 'COMPLETE_TRANSACTION') {
        const payload = (cmd as any).payload ?? {}
        const txData = pick(payload, ['transaction', 'txData', 'response'])
        const core = extractTransactionCore(txData ?? payload)
        const { pumpId } = resolvePumpNozzle({
          ...payload,
          pumpNumber: Number(
            core.fpId ?? pick(payload, ['pumpNumber', 'fpId', 'FpId']) ?? 0,
          ),
        })
        const transSeqNo =
          core.transSeqNo ??
          String(pick(payload, ['transSeqNo', 'TransSeqNo']) ?? '').trim()
        if (!transSeqNo) {
          throw new Error(
            'COMPLETE_TRANSACTION requires TransSeqNo for clear_FpSupTrans_req',
          )
        }

        const request = buildClearSupervisedTransactionRequest({
          fpId: core.fpId ?? pumpId,
          posId: pick(payload, ['posId', 'PosId']) ?? posId,
          transSeqNo,
          txData,
          payload,
        })

        await requestWithTimeout(
          client,
          request,
          timeoutMs,
          'Timed out sending clear transaction command',
        )
        return {
          ok: true,
          accepted: true,
          data: {
            pumpId,
            transSeqNo: String(transSeqNo).padStart(4, '0'),
            clearVariant: request.subCode,
          },
        }
      }

      if (cmd.type === 'GET_ALL_TG_DATA') {
        const payload = (cmd as any).payload ?? {}
        const stationId = String(payload.stationId ?? '').trim()
        const tgIds = await resolveConfiguredTankGaugeIds(stationId)

        if (!tgIds.length) {
          throw new Error(
            'No configured DOMS tank ids found. Set domsTankId (or numeric tank code) for each tank in tank settings.',
          )
        }

        const responses: Array<{ tgId: string; response: any }> = []
        const normalized: Array<any> = []
        const errors: Array<{ tgId: string; error: string }> = []

        for (const tgId of tgIds) {
          try {
            const response = await requestWithTimeout(
              client,
              {
                name: 'TgData_req',
                subCode: '00H',
                data: { TgId: tgId, TankDataItemId: ALL_TANK_DATA_ITEM_IDS },
              },
              timeoutMs,
              `Timed out requesting tank gauge data for tank ${tgId}`,
            )
            responses.push({ tgId, response })
            const parsed = normalizeTgDataPayload(response)
            if (parsed) normalized.push(parsed)
          } catch (error) {
            errors.push({ tgId, error: getProtocolErrorText(error) })
          }
        }

        if (!responses.length) {
          const firstError =
            errors[0]?.error ?? 'Failed to request tank gauge data'
          throw new Error(firstError)
        }

        let tankStatusSnapshot: any = null
        try {
          const statusResult = await requestWithSubCodeFallback(client, {
            name: 'TgStatus_req',
            variants: [
              { subCode: '02H', data: { TgId: ID_ZERO } },
              { subCode: '01H', data: { TgId: ID_ZERO } },
              { subCode: '00H', data: { TgId: ID_ZERO } },
            ],
            timeoutMs,
            timeoutMessage: 'Timed out requesting tank status snapshot',
          })
          tankStatusSnapshot = {
            response: statusResult.response,
            usedSubCode: statusResult.usedSubCode,
          }
          rememberGatewaySnapshot(
            'TgStatus_resp',
            statusResult.response,
            statusResult.usedSubCode,
          )
        } catch (error) {
          tankStatusSnapshot = { error: getProtocolErrorText(error) }
        }

        return {
          ok: true,
          accepted: true,
          data: {
            requestedTgIds: tgIds,
            responses,
            normalized,
            errors,
            tankStatusSnapshot,
          },
        }
      }

      if (cmd.type === 'CHANGE_DYNAMIC_TANK_DATA') {
        const payload = (cmd as any).payload ?? {}
        const tankId = toId2(
          toInt(payload.TankId ?? payload.tankId ?? payload.tgId, 0),
        )
        const densityValue = String(
          payload.DensityValue ?? payload.densityValue ?? '',
        )
        const expireDateAndTime = String(
          payload.ExpireDateAndTime ?? payload.expireDateAndTime ?? '',
        )
        const scrollingSpeed = String(
          payload.ScrollingSpeed ?? payload.scrollingSpeed ?? '00H',
        )
        const textValue = String(payload.Text ?? payload.text ?? '')
        const response = await requestWithTimeout(
          client,
          {
            name: 'change_DynamicTankData_req',
            subCode: '00H',
            data: {
              TankId: tankId,
              DtdPars: {
                EnteredDensity: {
                  DensityValue: densityValue,
                  ExpireDateAndTime: expireDateAndTime,
                  ScrollingSpeed: scrollingSpeed,
                  Text: textValue,
                },
              },
            },
          },
          timeoutMs,
          'Timed out updating dynamic tank data',
        )
        return { ok: true, accepted: true, data: response }
      }

      if (cmd.type === 'GET_TG_ERROR_MSG') {
        const payload = (cmd as any).payload ?? {}
        const tankId = toId2(
          toInt(
            payload.TgId ?? payload.tgId ?? payload.tankId ?? payload.TankId,
            0,
          ),
        )
        const response = await requestWithTimeout(
          client,
          {
            name: 'TgErrorMsg_req',
            subCode: '00H',
            data: { TgId: tankId },
          },
          timeoutMs,
          'Timed out requesting tank gauge error',
        )
        return { ok: true, accepted: true, data: response }
      }

      if (cmd.type === 'GET_GRADE_PRICES') {
        const payload = ((cmd as any).payload ?? {}) as Record<string, unknown>
        const type = String(payload.type ?? 'current')
          .trim()
          .toLowerCase()
        const statusResult = await readPriceSetStatus(client, timeoutMs)
        const status = statusResult.response
        const pending = statusResult.supportsPendingQueue
          ? extractPendingPriceSets(status)
          : []
        const warnings: string[] = []
        if (!statusResult.supportsPendingQueue) {
          warnings.push(
            'This controller only supports FcPriceSetStatus SUBC 00H, so pending scheduled price sets cannot be listed.',
          )
        }

        if (type === 'pending') {
          const requestedPriceSetId = toId2String(
            payload.fcPriceSetId ?? payload.priceSetId,
            '',
          )
          const requestedActivationAt = String(
            payload.activationAt ??
              payload.effectiveAt ??
              payload.effectiveDate ??
              '',
          ).trim()

          const matchedPending = pending.find((item) => {
            const byId = requestedPriceSetId
              ? item.fcPriceSetId === requestedPriceSetId
              : true
            const byActivation = requestedActivationAt
              ? item.activationAt === toFcDateTime(requestedActivationAt)
              : true
            return byId && byActivation
          })

          if (!matchedPending) {
            return {
              ok: true,
              accepted: true,
              data: {
                status,
                pending,
                current: null,
                requestedPending: null,
                warnings,
                capabilities: {
                  priceSetStatusSubCode: statusResult.usedSubCode,
                  supportsPendingQueue: statusResult.supportsPendingQueue,
                  supportsSpecificPendingPriceSet: false,
                },
              },
            }
          }

          let requestedPending: any = null
          let requestedPendingError: string | undefined
          let requestedPendingSubCode: string | undefined
          try {
            const requestedPendingResult = await readSpecificPriceSet(
              client,
              timeoutMs,
              matchedPending.fcPriceSetId,
              matchedPending.activationAt,
            )
            requestedPending = requestedPendingResult.response
            requestedPendingSubCode = requestedPendingResult.usedSubCode
          } catch (error: any) {
            requestedPendingError = error?.message ?? String(error)
            warnings.push(
              'The controller reported the pending activation queue but did not allow reading a specific pending price set.',
            )
          }
          return {
            ok: true,
            accepted: true,
            data: {
              status,
              pending,
              current: null,
              requestedPending,
              requestedPendingError,
              warnings,
              capabilities: {
                priceSetStatusSubCode: statusResult.usedSubCode,
                supportsPendingQueue: statusResult.supportsPendingQueue,
                supportsSpecificPendingPriceSet: Boolean(
                  requestedPendingSubCode,
                ),
                pendingPriceSetSubCode: requestedPendingSubCode,
              },
            },
          }
        }

        let current: any = null
        let currentError: string | undefined
        let currentSubCode: string | undefined
        try {
          const currentResult = await readCurrentPriceSet(client, timeoutMs)
          current = currentResult.response
          currentSubCode = currentResult.usedSubCode
        } catch (error: any) {
          currentError = error?.message ?? String(error)
        }

        return {
          ok: true,
          accepted: true,
          data: {
            status,
            pending,
            current,
            currentError,
            warnings,
            capabilities: {
              priceSetStatusSubCode: statusResult.usedSubCode,
              supportsPendingQueue: statusResult.supportsPendingQueue,
              currentPriceSetSubCode: currentSubCode,
              supportsSpecificPendingPriceSet: false,
            },
          },
        }
      }

      if (cmd.type === 'CHANGE_GRADE_PRICES') {
        const payload = ((cmd as any).payload ?? {}) as Record<string, unknown>
        const entries = extractEntries(payload)
        if (!entries.length) {
          return {
            ok: false,
            accepted: false,
            error: 'No price entries were provided for scheduling',
          }
        }

        const activationAt = toFcDateTime(
          payload.activationAt ?? payload.effectiveAt ?? payload.effectiveDate,
        )
        const requestedBy =
          String(
            payload.requestedBy ?? payload.userId ?? payload.UserId ?? 'system',
          ).trim() || 'system'

        const statusBeforeResult = await readPriceSetStatus(client, timeoutMs)
        const statusBefore = statusBeforeResult.response
        const warnings: string[] = []
        if (!statusBeforeResult.supportsPendingQueue) {
          warnings.push(
            'This controller only supports FcPriceSetStatus SUBC 00H, so pending scheduled price sets cannot be listed or verified.',
          )
        }

        let currentResponse: any = null
        let currentPriceSetSubCode: string | undefined
        try {
          const currentPriceSetResult = await readCurrentPriceSet(
            client,
            timeoutMs,
          )
          currentResponse = currentPriceSetResult.response
          currentPriceSetSubCode = currentPriceSetResult.usedSubCode
        } catch {
          currentResponse = null
        }

        const currentBank = toPriceBank(currentResponse)
        const explicitBank = extractExplicitPriceBank(payload)
        const baseBank = currentBank ?? explicitBank
        if (!baseBank) {
          return {
            ok: false,
            accepted: false,
            error:
              'Unable to resolve the active DOMS price bank. Provide a full price bank payload or load prices on the controller first.',
          }
        }

        const mergedBank = mergePriceBank(baseBank, entries)
        if (
          statusBeforeResult.supportsPendingQueue &&
          (payload.clearExistingAtSameActivation ??
            payload.replaceExistingAtSameActivation) === true
        ) {
          const pending = extractPendingPriceSets(statusBefore)
          const toClear = pending.filter(
            (item) =>
              item.activationAt === activationAt &&
              item.fcPriceSetId === mergedBank.fcPriceSetId,
          )
          for (const item of toClear) {
            await clearPendingPriceSet(
              client,
              timeoutMs,
              item.fcPriceSetId,
              item.activationAt,
            )
          }
        }

        const responseResult = await changePriceSet(client, timeoutMs, {
          userId: requestedBy,
          fcPriceSetId: mergedBank.fcPriceSetId,
          fcPriceGroupIds: mergedBank.fcPriceGroupIds,
          fcGradeIds: mergedBank.fcGradeIds,
          fcPriceGroups: mergedBank.fcPriceGroups,
          activationAt,
        })
        if (!responseResult.preservesPendingQueue) {
          warnings.push(
            `The controller accepted scheduling via change_FcPriceSet ${responseResult.usedSubCode}, which may clear existing pending price sets automatically.`,
          )
        }

        const statusAfterResult = await readPriceSetStatus(client, timeoutMs)
        const statusAfter = statusAfterResult.response
        const pendingAfter = statusAfterResult.supportsPendingQueue
          ? extractPendingPriceSets(statusAfter)
          : []
        const requestedPending = pendingAfter.find(
          (item) =>
            item.activationAt === activationAt &&
            item.fcPriceSetId === mergedBank.fcPriceSetId,
        )

        if (!requestedPending) {
          logger.warn('[jpl]', {
            msg: 'price scheduling accepted without queue verification',
            activationAt,
            fcPriceSetId: mergedBank.fcPriceSetId,
            changePriceSetSubCode: responseResult.usedSubCode,
            priceSetStatusSubCode: statusAfterResult.usedSubCode,
            supportsPendingQueue: statusAfterResult.supportsPendingQueue,
          })
        }

        return {
          ok: true,
          accepted: true,
          data: {
            requestedBy,
            activationAt,
            scheduled: requestedPending ?? null,
            controllerAccepted: true,
            verifiedOnController: Boolean(requestedPending),
            response: responseResult.response,
            responseSubCode: responseResult.usedSubCode,
            statusBefore,
            statusAfter,
            priceBank: mergedBank,
            warnings,
            capabilities: {
              priceSetStatusSubCode: statusBeforeResult.usedSubCode,
              supportsPendingQueue: statusBeforeResult.supportsPendingQueue,
              currentPriceSetSubCode,
              changePriceSetSubCode: responseResult.usedSubCode,
            },
          },
        }
      }

      if (cmd.type === 'GET_ALL_TANK_DELIVERY_DATA') {
        let siteDeliveryStatus: any = null
        let siteDeliveryStatusSubCode: string | null = null
        let tgStatusSnapshot: any = null
        let tgStatusSubCode: string | null = null
        let tgIds: string[] = []

        try {
          const siteDeliveryStatusResult = await requestWithSubCodeFallback(
            client,
            {
              name: 'SiteDeliveryStatus_req',
              variants: [
                { subCode: '01H', data: {} },
                { subCode: '00H', data: {} },
              ],
              timeoutMs,
              timeoutMessage: 'Timed out requesting site delivery status',
            },
          )

          siteDeliveryStatus = siteDeliveryStatusResult.response
          siteDeliveryStatusSubCode = siteDeliveryStatusResult.usedSubCode
          tgIds = extractDeliveryTgIdsFromSiteStatus(siteDeliveryStatus)
        } catch (error) {
          logger.warn('[jpl]', {
            msg: 'unable to read site delivery status before tank delivery read',
            error: getProtocolErrorText(error),
          })
        }

        if (!tgIds.length) {
          try {
            const tgStatusResult = await requestWithSubCodeFallback(client, {
              name: 'TgStatus_req',
              variants: [
                { subCode: '01H', data: { TgId: ID_ZERO } },
                { subCode: '02H', data: { TgId: ID_ZERO } },
                { subCode: '00H', data: { TgId: ID_ZERO } },
              ],
              timeoutMs,
              timeoutMessage:
                'Timed out requesting tank gauge status for delivery candidates',
            })

            tgStatusSnapshot = tgStatusResult.response
            tgStatusSubCode = tgStatusResult.usedSubCode
            tgIds = extractDeliveryTgIdsFromTgStatus(tgStatusSnapshot)
          } catch (error) {
            logger.warn('[jpl]', {
              msg: 'unable to derive tank delivery candidates from TgStatus',
              error: getProtocolErrorText(error),
            })
          }
        }

        const uniqueTgIds = Array.from(new Set(tgIds))
        const deliveries: Array<{ tgId: string; response: any }> = []
        const errors: Array<{ tgId: string; error: string }> = []

        for (const tgId of uniqueTgIds) {
          try {
            const response = await requestWithTimeout(
              client,
              {
                name: 'TankDeliveryData_req',
                subCode: '00H',
                data: {
                  TgId: tgId,
                  PosId: posId,
                  ZERO: 1,
                  TankDeliveryDataItemId: ALL_TANK_DELIVERY_ITEM_IDS,
                },
              },
              timeoutMs,
              `Timed out requesting tank delivery data for TgId ${tgId}`,
            )
            deliveries.push({ tgId, response })
          } catch (error) {
            errors.push({ tgId, error: getProtocolErrorText(error) })
          }
        }

        const normalizedDeliveries = deliveries
          .map((entry) => ({
            tgId: entry.tgId,
            normalized: normalizeTankDeliveryDataPayload(entry.response, '00H'),
            response: entry.response,
          }))
          .filter((entry) => Boolean(entry.normalized?.tgId))

        const checkpointSummary = normalizedDeliveries
          .map((entry) => {
            const normalized = entry.normalized
            const deliveryReportSeqNo = String(
              normalized?.deliveryReportSeqNo ?? '',
            ).trim()
            const tankDeliverySeqNo = String(
              normalized?.tankDeliverySeqNo ?? '',
            ).trim()
            if (!deliveryReportSeqNo || !tankDeliverySeqNo) return null
            return {
              tgId: String(normalized?.tgId ?? '')
                .trim()
                .padStart(2, '0'),
              deliveryReportSeqNo,
              tankDeliverySeqNo,
              clearStatus: 'pending_clear',
            }
          })
          .filter(Boolean)

        return {
          ok: true,
          accepted: true,
          data: {
            siteDeliveryStatus,
            siteDeliveryStatusSubCode,
            tgStatusSnapshot,
            tgStatusSubCode,
            tgIds: uniqueTgIds,
            deliveries,
            normalizedDeliveries,
            checkpointSummary,
            errors,
          },
        }
      }

      return {
        ok: false,
        accepted: false,
        error: `Unsupported JPL command type: ${String(cmd.type)}`,
      }
    } catch (e: any) {
      return { ok: false, accepted: false, error: e?.message ?? String(e) }
    }
  })
}
