import type { BufferMode } from '@/src/modules/forecourt/infrastructure/jpl/types'

import { queryOne } from '@/src/platform/db/postgres'
import { getJplAdapterState } from '@/src/shared/forecourt/jplState'

const digits = (value: unknown, length: number): string | null => {
  const normalized = String(value ?? '').replace(/\D/g, '')
  return normalized.length === length ? normalized : null
}

const unwrapTransactionData = (value: any) =>
  value?.data ?? value?.payload?.data ?? value?.payload ?? value ?? {}

const transactionPars = (value: any) => {
  const data = unwrapTransactionData(value)
  return data?.TransPars ?? data?.transPars ?? {}
}

const pick = (value: any, keys: string[]) => {
  for (const key of keys) {
    if (value && Object.prototype.hasOwnProperty.call(value, key)) {
      return value[key]
    }
  }
  return undefined
}

export const extractDomsFinishToken = (value: any): string | null => {
  const data = unwrapTransactionData(value)
  const pars = transactionPars(value)
  const date = digits(
    pick(data, ['FinishDate', 'finishDate']) ??
      pick(pars, ['FinishDate', 'finishDate']),
    8,
  )
  const time = digits(
    pick(data, ['FinishTime', 'finishTime']) ??
      pick(pars, ['FinishTime', 'finishTime']),
    6,
  )
  return date && time ? `${date}${time}` : null
}

export const parseDomsCompactDateTime = (value: unknown): Date | null => {
  const token = digits(value, 14)
  if (!token) return null

  const year = Number(token.slice(0, 4))
  const month = Number(token.slice(4, 6))
  const day = Number(token.slice(6, 8))
  const hour = Number(token.slice(8, 10))
  const minute = Number(token.slice(10, 12))
  const second = Number(token.slice(12, 14))

  const parsed = new Date(year, month - 1, day, hour, minute, second, 0)
  if (
    parsed.getFullYear() !== year ||
    parsed.getMonth() !== month - 1 ||
    parsed.getDate() !== day ||
    parsed.getHours() !== hour ||
    parsed.getMinutes() !== minute ||
    parsed.getSeconds() !== second
  ) {
    return null
  }
  return parsed
}

export const resolveDomsFinishDateTime = (value: any): Date | null =>
  parseDomsCompactDateTime(extractDomsFinishToken(value))

export const getCurrentDomsMasterResetToken = (): string | null =>
  digits(getJplAdapterState()?.lastFcStatus?.FcMasterResetDateAndTime, 14)

export const buildDomsTransactionIdentity = (args: {
  sourceMode: BufferMode
  fpId: number
  transSeqNo: number
  finishToken?: string | null
  masterResetToken?: string | null
}) => {
  const base = `${args.sourceMode}:${Math.trunc(args.fpId)}:${String(Math.trunc(args.transSeqNo)).padStart(4, '0')}`
  if (args.finishToken) return `finish:${base}:${args.finishToken}`
  if (args.masterResetToken) return `reset:${base}:${args.masterResetToken}`
  return `sequence:${base}`
}

type ExistingIdentityRow = {
  id: string
  doms_transaction_identity: string | null
  doms_first_seen_at: string | null
}

export const shouldStartNewDomsSequenceIncarnation = (args: {
  existingFirstSeenAt?: Date | string | null
  finishAt?: Date | null
  masterResetAt?: Date | null
  toleranceMs?: number
}): boolean => {
  const firstSeen =
    args.existingFirstSeenAt instanceof Date
      ? args.existingFirstSeenAt
      : args.existingFirstSeenAt
        ? new Date(args.existingFirstSeenAt)
        : null
  const firstSeenMs = firstSeen?.getTime()
  if (!Number.isFinite(firstSeenMs)) return false

  const toleranceMs = Math.max(0, Number(args.toleranceMs ?? 60_000))
  return [args.masterResetAt, args.finishAt].some(
    (evidenceAt) =>
      evidenceAt instanceof Date &&
      Number.isFinite(evidenceAt.getTime()) &&
      evidenceAt.getTime() > Number(firstSeenMs) + toleranceMs,
  )
}

/**
 * TransSeqNo is a DEC4 rolling counter and restarts at 0001 after a Master
 * Reset. A sequence-only database key therefore cannot be a lifetime identity.
 *
 * Existing pre-migration rows retain their sequence identity when the current
 * buffered sale can still be the same physical transaction. A controller
 * finish timestamp later than the old first-seen timestamp, or a Master Reset
 * later than that timestamp, proves that the controller is presenting a newer
 * incarnation of the same DEC4 sequence.
 */
export const resolveDomsTransactionIdentity = async (args: {
  stationId: string
  sourceMode: BufferMode
  fpId: number
  transSeqNo: number
  transaction: any
}): Promise<string> => {
  const finishToken = extractDomsFinishToken(args.transaction)
  const finishAt = parseDomsCompactDateTime(finishToken)
  const masterResetToken = getCurrentDomsMasterResetToken()
  const masterResetAt = parseDomsCompactDateTime(masterResetToken)
  const candidate = buildDomsTransactionIdentity({
    sourceMode: args.sourceMode,
    fpId: args.fpId,
    transSeqNo: args.transSeqNo,
    finishToken,
    masterResetToken,
  })

  const exact = await queryOne<ExistingIdentityRow>(
    `SELECT id, doms_transaction_identity, doms_first_seen_at::text AS doms_first_seen_at
       FROM transactions
      WHERE station_id = $1
        AND doms_source_system = 'jpl'
        AND doms_transaction_identity = $2
      LIMIT 1`,
    [args.stationId, candidate],
  )
  if (exact?.id) return candidate

  const existing = await queryOne<ExistingIdentityRow>(
    `SELECT id, doms_transaction_identity, doms_first_seen_at::text AS doms_first_seen_at
       FROM transactions
      WHERE station_id = $1
        AND doms_source_system = 'jpl'
        AND doms_source_mode = $2
        AND doms_fp_id = $3
        AND doms_trans_seq_no = $4
      ORDER BY doms_last_seen_at DESC NULLS LAST, created_at DESC
      LIMIT 1`,
    [args.stationId, args.sourceMode, args.fpId, args.transSeqNo],
  )

  if (!existing?.id) return candidate

  const existingIdentity =
    String(existing.doms_transaction_identity ?? '').trim() ||
    buildDomsTransactionIdentity({
      sourceMode: args.sourceMode,
      fpId: args.fpId,
      transSeqNo: args.transSeqNo,
    })
  if (
    shouldStartNewDomsSequenceIncarnation({
      existingFirstSeenAt: existing.doms_first_seen_at,
      finishAt,
      masterResetAt,
    })
  ) {
    return candidate
  }

  // With no positive evidence of rollover/reset, favor idempotent recovery of
  // the already-captured transaction rather than creating a duplicate sale.
  return existingIdentity
}
