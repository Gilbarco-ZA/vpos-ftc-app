import { logger } from '@/src/shared/utils/logger'

import { buildJplCommandRequest } from '@/src/modules/forecourt/infrastructure/jpl/protocol/commands'
import { prepareJplOutboundMessage } from '@/src/modules/forecourt/infrastructure/jpl/protocol/schema'

function timeout<T>(ms: number, message: string): Promise<T> {
  return new Promise((_, reject) => {
    const timer = setTimeout(() => {
      clearTimeout(timer)
      reject(Object.assign(new Error(message), { code: 'TIMEOUT' }))
    }, ms)
  })
}

export async function requestWithTimeout(
  client: any,
  message: any,
  timeoutMs: number,
  timeoutMessage: string,
) {
  const outbound = prepareJplOutboundMessage(message)
  return await Promise.race([
    client.request(outbound, { timeoutMs }),
    timeout<any>(timeoutMs, timeoutMessage),
  ])
}

export function getProtocolRejectDetails(error: any) {
  const data =
    error?.details?.raw?.data ??
    error?.data ??
    error?.payload?.data ??
    error?.response?.data ??
    {}
  const rejectCode =
    data?.RejectCode?.value ?? data?.rejectCode?.value ?? data?.RejectCode
  return {
    rejectCode: rejectCode != null ? String(rejectCode) : undefined,
    rejectedExtendedMsgCode:
      data?.RejectedExtendedMsgCode != null
        ? String(data.RejectedExtendedMsgCode)
        : undefined,
    rejectedMsgSubc:
      data?.RejectedMsgSubc != null ? String(data.RejectedMsgSubc) : undefined,
    rejectInfo: data?.RejectInfo != null ? String(data.RejectInfo) : undefined,
    rejectInfoText:
      data?.RejectInfoText != null
        ? String(data.RejectInfoText)
        : data?.rejectInfoText != null
          ? String(data.rejectInfoText)
          : undefined,
    correlationId:
      error?.correlationId ??
      error?.details?.raw?.correlationId ??
      error?.payload?.correlationId ??
      error?.response?.correlationId ??
      undefined,
  }
}

export function getProtocolErrorText(error: any) {
  const details = getProtocolRejectDetails(error)
  const message = String(error?.message ?? error ?? '').trim()
  return [message, details.rejectInfoText, details.rejectInfo]
    .filter(Boolean)
    .join(' | ')
}

export function isUnknownSubCodeError(
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

export function buildCommandVariant(
  action: string,
  payload: Record<string, unknown>,
) {
  const request = buildJplCommandRequest(action, payload)
  if (!request?.subCode) {
    throw new Error(`Unable to build ${action} JPL request variant`)
  }
  return {
    subCode: request.subCode,
    data: request.data ?? {},
  }
}

export type SubCodeVariant = {
  name?: string
  subCode: string
  data: Record<string, unknown>
}

export async function requestWithSubCodeFallback(
  client: any,
  options: {
    name: string
    variants: SubCodeVariant[]
    timeoutMs: number
    timeoutMessage: string
  },
) {
  let lastError: any = null

  for (const variant of options.variants) {
    const requestName = variant.name ?? options.name
    try {
      const response = await requestWithTimeout(
        client,
        {
          name: requestName,
          subCode: variant.subCode,
          data: variant.data,
        },
        options.timeoutMs,
        options.timeoutMessage,
      )
      return {
        response,
        usedName: requestName,
        usedSubCode: variant.subCode,
      }
    } catch (error: any) {
      lastError = error
      if (!isUnknownSubCodeError(error, requestName, variant.subCode)) {
        logger.error('[jpl]', {
          msg: 'request failed',
          name: requestName,
          subCode: variant.subCode,
          error: getProtocolErrorText(error),
          reject: getProtocolRejectDetails(error),
        })
        throw error
      }

      logger.warn('[jpl]', {
        msg: 'message name or subCode unsupported; trying fallback',
        name: requestName,
        subCode: variant.subCode,
        error: getProtocolErrorText(error),
        reject: getProtocolRejectDetails(error),
      })
    }
  }

  throw lastError ?? new Error(`No supported subCode found for ${options.name}`)
}
