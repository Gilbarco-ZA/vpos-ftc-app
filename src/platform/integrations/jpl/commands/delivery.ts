import type {
  JplCommandContext,
  JplCommandHandlerResult,
} from '@/src/platform/integrations/jpl/commands/contracts'

import {
  getProtocolErrorText,
  requestWithSubCodeFallback,
  requestWithTimeout,
} from '@/src/platform/integrations/jpl/protocol/runtime'
import {
  rememberGatewaySnapshot,
  toResponseEnvelopeData,
} from '@/src/platform/integrations/jpl/protocol/snapshots'
import { logger } from '@/src/shared/utils/logger'

import { buildJplCommandRequest } from '@/src/modules/forecourt/infrastructure/jpl/protocol/commands'
import {
  normalizeSiteDeliveryStatusPayload,
  normalizeTankDeliveryDataPayload,
} from '@/src/modules/forecourt/infrastructure/jpl/protocol/normalize'

const ID_ZERO = '00'
const ALL_TANK_DELIVERY_ITEM_IDS = Array.from({ length: 29 }, (_, index) =>
  String(index + 1).padStart(2, '0'),
)

export type DeliveryCommandDeps = {
  requestWithTimeout?: (
    client: any,
    message: any,
    timeoutMs: number,
    timeoutMessage: string,
  ) => Promise<any>
  requestWithSubCodeFallback?: (
    client: any,
    options: {
      name: string
      variants: Array<{
        name?: string
        subCode: string
        data: Record<string, unknown>
      }>
      timeoutMs: number
      timeoutMessage: string
    },
  ) => Promise<any>
  getProtocolErrorText?: (error: any) => string
  rememberGatewaySnapshot?: (
    kind: string,
    response: any,
    usedSubCode?: string,
  ) => any
  normalizeSiteDeliveryStatusPayload?: (
    payload: unknown,
    usedSubCode?: string,
  ) => any
  normalizeTankDeliveryDataPayload?: (
    payload: unknown,
    usedSubCode?: string,
  ) => any
  buildJplCommandRequest?: (
    action: string,
    payload: Record<string, unknown>,
  ) => any
}

const pick = (value: any, keys: string[]) => {
  for (const key of keys) {
    if (value && Object.prototype.hasOwnProperty.call(value, key)) {
      return value[key]
    }
  }
  return undefined
}

const toId2String = (value: unknown, fallback = ID_ZERO) => {
  if (typeof value === 'string' && /^\d+$/.test(value.trim())) {
    return value.trim().padStart(2, '0')
  }
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return fallback
  return String(Math.max(0, Math.trunc(parsed))).padStart(2, '0')
}

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

type SiteDeliveryIdNormalizer = (
  payload: unknown,
  usedSubCode?: string,
) => {
  readyTgIds?: unknown
  tankDeliveries?: unknown
  tankTicketedDeliveries?: unknown
  tgIds?: unknown
}

export const extractDeliveryTgIdsFromSiteStatus = (
  response: any,
  normalize: SiteDeliveryIdNormalizer = normalizeSiteDeliveryStatusPayload,
): string[] => {
  const normalized = normalize(toResponseEnvelopeData(response))
  const candidates = [
    normalized.readyTgIds,
    normalized.tankDeliveries,
    normalized.tankTicketedDeliveries,
    normalized.tgIds,
  ]
  const ids = candidates.flatMap((candidate) => coerceId2List(candidate))
  return Array.from(new Set(ids))
}

const hasDeliveryStatusBit = (value: any, key: string) => {
  if (!value || typeof value !== 'object') return false
  return Boolean(value?.bits?.[key] ?? value?.[key])
}

export const extractDeliveryTgIdsFromTgStatus = (response: any): string[] => {
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

export async function handleDeliveryCommand(
  context: JplCommandContext,
  dependencyOverrides: DeliveryCommandDeps = {},
): Promise<JplCommandHandlerResult> {
  if (context.cmd.type !== 'GET_ALL_TANK_DELIVERY_DATA') return null

  const { client, posId, timeoutMs } = context
  const deps = {
    requestWithTimeout:
      dependencyOverrides.requestWithTimeout ?? requestWithTimeout,
    requestWithSubCodeFallback:
      dependencyOverrides.requestWithSubCodeFallback ??
      requestWithSubCodeFallback,
    getProtocolErrorText:
      dependencyOverrides.getProtocolErrorText ?? getProtocolErrorText,
    rememberGatewaySnapshot:
      dependencyOverrides.rememberGatewaySnapshot ?? rememberGatewaySnapshot,
    normalizeSiteDeliveryStatusPayload:
      dependencyOverrides.normalizeSiteDeliveryStatusPayload ??
      normalizeSiteDeliveryStatusPayload,
    normalizeTankDeliveryDataPayload:
      dependencyOverrides.normalizeTankDeliveryDataPayload ??
      normalizeTankDeliveryDataPayload,
    buildJplCommandRequest:
      dependencyOverrides.buildJplCommandRequest ?? buildJplCommandRequest,
  }

  let siteDeliveryStatus: any = null
  let normalizedSiteDeliveryStatus: any = null
  let siteDeliveryStatusSubCode: string | null = null
  let tgStatusSnapshot: any = null
  let tgStatusSubCode: string | null = null
  let tgIds: string[] = []

  try {
    const siteDeliveryStatusResult = await deps.requestWithSubCodeFallback(
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
    normalizedSiteDeliveryStatus = deps.rememberGatewaySnapshot(
      'SiteDeliveryStatus_resp',
      siteDeliveryStatusResult.response,
      siteDeliveryStatusResult.usedSubCode,
    )
    tgIds = extractDeliveryTgIdsFromSiteStatus(
      siteDeliveryStatus,
      deps.normalizeSiteDeliveryStatusPayload,
    )
  } catch (error) {
    logger.warn('[jpl]', {
      msg: 'unable to read site delivery status before tank delivery read',
      error: deps.getProtocolErrorText(error),
    })
  }

  if (!tgIds.length) {
    try {
      const tgStatusResult = await deps.requestWithSubCodeFallback(client, {
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
        error: deps.getProtocolErrorText(error),
      })
    }
  }

  const uniqueTgIds = Array.from(new Set(tgIds))
  const deliveries: Array<{ tgId: string; response: any }> = []
  const errors: Array<{ tgId: string; error: string }> = []

  for (const tgId of uniqueTgIds) {
    try {
      const request = deps.buildJplCommandRequest('READ_TANK_DELIVERY_DATA', {
        tgId,
        posId,
        tankDeliveryDataItemId: ALL_TANK_DELIVERY_ITEM_IDS,
      })
      const response = await deps.requestWithTimeout(
        client,
        request,
        timeoutMs,
        `Timed out requesting tank delivery data for TgId ${tgId}`,
      )
      deliveries.push({ tgId, response })
    } catch (error) {
      errors.push({ tgId, error: deps.getProtocolErrorText(error) })
    }
  }

  const normalizedDeliveries = deliveries
    .map((entry) => ({
      tgId: entry.tgId,
      normalized: deps.normalizeTankDeliveryDataPayload(entry.response, '00H'),
      response: entry.response,
    }))
    .filter((entry) => Boolean(entry.normalized?.tgId))

  const deliveryClearTargets = normalizedDeliveries
    .map((entry) => entry.normalized?.clearTarget)
    .filter(Boolean)

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
      normalizedSiteDeliveryStatus,
      siteDeliveryStatusSubCode,
      tgStatusSnapshot,
      tgStatusSubCode,
      tgIds: uniqueTgIds,
      deliveries,
      normalizedDeliveries,
      deliveryClearTargets,
      checkpointSummary,
      errors,
    },
  }
}
