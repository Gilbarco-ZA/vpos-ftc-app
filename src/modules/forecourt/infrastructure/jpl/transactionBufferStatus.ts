import '@/src/modules/forecourt/infrastructure/jpl/globals'

import type { JplTransactionBufferSubCode } from '@/src/modules/forecourt/infrastructure/jpl/transactionReplayPolicy'
import type { BufferMode } from '@/src/modules/forecourt/infrastructure/jpl/types'

import { logger } from '@/src/shared/utils/logger'

import { serializeError } from '@/src/modules/forecourt/infrastructure/adapters/jplTcpAdapter.helpers'
import { prepareJplOutboundMessage } from '@/src/modules/forecourt/infrastructure/jpl/protocol/schema'
import {
  buildTransactionBufferEventType,
  JPL_TRANSACTION_BUFFER_SUBCODES,
} from '@/src/modules/forecourt/infrastructure/jpl/transactionReplayPolicy'

const getRejectData = (err: unknown): Record<string, any> | null => {
  const anyErr = err as any
  return (
    anyErr?.details?.raw?.data ??
    anyErr?.rejectMessage?.data ??
    anyErr?.data ??
    anyErr?.response?.data ??
    anyErr?.cause?.data ??
    null
  )
}

const isUnsupportedSubCodeReject = (err: unknown): boolean => {
  const data = getRejectData(err)
  const rejectCode = String(
    data?.RejectCode?.value ?? data?.rejectCode?.value ?? '',
  ).toUpperCase()
  const infoText = String(
    data?.RejectInfoText ?? data?.rejectInfoText ?? '',
  ).toLowerCase()

  if (rejectCode === '01H') return true
  if (rejectCode !== '02H') return false

  return (
    infoText.includes('subcode') ||
    infoText.includes('unknown') ||
    infoText.includes('object does not contain')
  )
}

const bufferStatusNames = (sourceMode: BufferMode) =>
  sourceMode === 'supervised'
    ? {
        request: 'FpSupTransBufStatus_req' as const,
        response: 'FpSupTransBufStatus_resp' as const,
        list: 'TransInSupBuffer' as const,
      }
    : {
        request: 'FpUnSupTransBufStatus_req' as const,
        response: 'FpUnSupTransBufStatus_resp' as const,
        list: 'TransInUnSupBuffer' as const,
      }

const unwrapData = (value: any) =>
  value?.data ?? value?.payload?.data ?? value?.payload ?? value ?? {}

const preferredSubCodeStore = () => {
  if (!globalThis.__jplTransactionBufferPreferredSubCode) {
    globalThis.__jplTransactionBufferPreferredSubCode = {}
  }
  return globalThis.__jplTransactionBufferPreferredSubCode
}

const orderedSubCodes = (sourceMode: BufferMode) => {
  const preferred = preferredSubCodeStore()[sourceMode]
  const validPreferred = JPL_TRANSACTION_BUFFER_SUBCODES.includes(
    preferred as JplTransactionBufferSubCode,
  )
    ? (preferred as JplTransactionBufferSubCode)
    : null
  if (!validPreferred) return [...JPL_TRANSACTION_BUFFER_SUBCODES]
  return [
    validPreferred,
    ...JPL_TRANSACTION_BUFFER_SUBCODES.filter(
      (subCode) => subCode !== validPreferred,
    ),
  ]
}

export const resetTransactionBufferSubCodePreference = () => {
  globalThis.__jplTransactionBufferPreferredSubCode = {}
}

export const getTransactionBufferEntries = (
  sourceMode: BufferMode,
  response: any,
): any[] => {
  const data = unwrapData(response)
  const key = bufferStatusNames(sourceMode).list
  const entries = data?.[key]
  return Array.isArray(entries) ? entries : []
}

export const transactionBufferContains = (args: {
  sourceMode: BufferMode
  response: any
  transSeqNo: unknown
}): boolean => {
  const expected = Number(args.transSeqNo)
  if (!Number.isFinite(expected)) return false

  return getTransactionBufferEntries(args.sourceMode, args.response).some(
    (entry) => {
      const actual = Number(
        entry?.TransSeqNo ??
          entry?.transSeqNo ??
          entry?.TransSeqNo_e ??
          entry?.transSeqNo_e,
      )
      return Number.isFinite(actual) && actual === expected
    },
  )
}

export const requestTransactionBufferStatusWithFallback = async (args: {
  client: any
  sourceMode: BufferMode
  fpId: string
}) => {
  const { client, sourceMode, fpId } = args
  const names = bufferStatusNames(sourceMode)

  let lastUnsupportedError: unknown = null
  for (const subCode of orderedSubCodes(sourceMode)) {
    try {
      const response = await client.request(
        prepareJplOutboundMessage({
          name: names.request,
          subCode,
          data: { FpId: fpId },
        }) as any,
      )

      preferredSubCodeStore()[sourceMode] = subCode
      return {
        response,
        responseEventType: buildTransactionBufferEventType(
          names.response,
          response?.subCode ?? subCode,
        ),
      }
    } catch (err) {
      if (!isUnsupportedSubCodeReject(err)) throw err
      if (preferredSubCodeStore()[sourceMode] === subCode) {
        delete preferredSubCodeStore()[sourceMode]
      }
      lastUnsupportedError = err
      logger.warn('[jplTcp] buffer status subCode unavailable; falling back', {
        name: names.request,
        fpId,
        subCode,
        err: serializeError(err),
      })
    }
  }

  throw (
    lastUnsupportedError ??
    new Error(`No supported ${names.request} subCode for Fp ${fpId}`)
  )
}

const delay = (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms)
  })

/**
 * A successful clear response is not treated as proof that the PSS buffer was
 * actually mutated. Re-read the authoritative buffer and only allow local
 * "cleared" state after the exact TransSeqNo has disappeared.
 */
export const verifyTransactionAbsentFromBuffer = async (args: {
  client: any
  sourceMode: BufferMode
  fpId: string
  transSeqNo: unknown
  attempts?: number
}) => {
  const attempts = Math.max(1, Math.min(5, Math.trunc(args.attempts ?? 3)))
  let lastStatus: Awaited<
    ReturnType<typeof requestTransactionBufferStatusWithFallback>
  > | null = null

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    lastStatus = await requestTransactionBufferStatusWithFallback({
      client: args.client,
      sourceMode: args.sourceMode,
      fpId: args.fpId,
    })

    if (
      !transactionBufferContains({
        sourceMode: args.sourceMode,
        response: lastStatus.response,
        transSeqNo: args.transSeqNo,
      })
    ) {
      return lastStatus
    }

    if (attempt < attempts) await delay(100 * attempt)
  }

  throw new Error(
    `DOMS ${args.sourceMode} buffer still contains Fp ${args.fpId} transaction ${String(args.transSeqNo).padStart(4, '0')} after clear response`,
  )
}
