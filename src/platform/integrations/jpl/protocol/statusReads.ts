import {
  buildCommandVariant,
  requestWithSubCodeFallback,
  requestWithTimeout,
} from '@/src/platform/integrations/jpl/protocol/runtime'
import {
  rememberGatewaySnapshot,
  toResponseEnvelopeData,
} from '@/src/platform/integrations/jpl/protocol/snapshots'

import { buildFpStatusSubCodePreference } from '@/src/modules/forecourt/infrastructure/jpl/dispense'
import { buildJplCommandRequest } from '@/src/modules/forecourt/infrastructure/jpl/protocol/commands'

const ALL_TANK_DELIVERY_ITEM_IDS = Array.from({ length: 29 }, (_, index) =>
  String(index + 1).padStart(2, '0'),
)

const supportedSubCodes = (
  preferredSubCode: string | undefined,
  defaults: string[],
  allowed: string[] = defaults,
) => {
  const requested = String(preferredSubCode ?? defaults[0] ?? '')
    .trim()
    .toUpperCase()
  const preferred = allowed.includes(requested) ? [requested] : []
  return [...preferred, ...defaults].filter(
    (value, index, list) => value && list.indexOf(value) === index,
  )
}

export async function readFpStatus(
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

export async function readFpInfo(
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

export async function readFpFuellingData(
  client: any,
  timeoutMs: number,
  fpId: string,
  preferredSubCode?: string,
) {
  const variants = supportedSubCodes(preferredSubCode, ['01H', '00H']).map(
    (subCode) => ({ subCode, data: { FpId: fpId } }),
  )
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

export async function readFpError(
  client: any,
  timeoutMs: number,
  fpId: string,
) {
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

export async function readTgStatus(
  client: any,
  timeoutMs: number,
  tgId: string,
  preferredSubCode?: string,
) {
  const variants = supportedSubCodes(
    preferredSubCode,
    ['01H', '00H'],
    ['00H', '01H', '02H'],
  ).map((subCode) => ({ subCode, data: { TgId: tgId } }))
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

export async function readSiteDeliveryStatus(
  client: any,
  timeoutMs: number,
  preferredSubCode?: string,
) {
  const variants = supportedSubCodes(preferredSubCode, ['01H', '00H']).map(
    (subCode) => ({ subCode, data: {} }),
  )
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

export async function readTankDeliveryData(
  client: any,
  timeoutMs: number,
  tgId: string,
  posId: string,
  itemIds?: string[],
) {
  const result = await requestWithSubCodeFallback(client, {
    name: 'TankDeliveryData_req',
    variants: [
      buildCommandVariant('READ_TANK_DELIVERY_DATA', {
        tgId,
        posId,
        tankDeliveryDataItemId: itemIds?.length
          ? itemIds
          : ALL_TANK_DELIVERY_ITEM_IDS,
      }),
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

export async function clearTankDeliveryData(
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

export async function sendSimpleWetstockCommand(
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

export async function readFcStatus(client: any, timeoutMs: number) {
  return await requestWithSubCodeFallback(client, {
    name: 'FcStatus_req',
    variants: [{ subCode: '00H', data: {} }],
    timeoutMs,
    timeoutMessage: 'Timed out requesting forecourt controller status',
  })
}

export async function readPosConnectionStatus(client: any, timeoutMs: number) {
  return await requestWithSubCodeFallback(client, {
    name: 'PosConnectionStatus_req',
    variants: [{ subCode: '00H', data: {} }],
    timeoutMs,
    timeoutMessage: 'Timed out requesting POS connection status',
  })
}

export async function readPssPeripheralsStatus(client: any, timeoutMs: number) {
  return await requestWithSubCodeFallback(client, {
    name: 'PssPeripheralsStatus_req',
    variants: [{ subCode: '00H', data: {} }],
    timeoutMs,
    timeoutMessage: 'Timed out requesting PSS peripherals status',
  })
}

export async function readFcServiceMessage(client: any, timeoutMs: number) {
  return await requestWithSubCodeFallback(client, {
    name: 'FcServiceMsg_req',
    variants: [{ subCode: '00H', data: {} }],
    timeoutMs,
    timeoutMessage: 'Timed out requesting forecourt service log message',
  })
}

export async function clearFcServiceMessage(
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

export function normalizeBackOfficeRecordResponse(
  response: any,
  usedSubCode: string,
) {
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

export async function readBackOfficeRecord(
  client: any,
  timeoutMs: number,
  preferredSubCode?: string,
) {
  const variants = supportedSubCodes(
    preferredSubCode ?? process.env.JPL_BACK_OFFICE_RECORD_SUBCODE,
    ['02H', '01H', '00H'],
  ).map((subCode) => ({ subCode, data: {} }))

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

export async function clearBackOfficeRecord(
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
