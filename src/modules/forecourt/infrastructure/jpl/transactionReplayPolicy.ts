import type { BufferMode } from '@/src/modules/forecourt/infrastructure/jpl/types'

type ReplayNozzleMapping = {
  nozzleId?: string | null
  nozzleNumber?: number | null
  fuelType?: string | null
  productCode?: string | null
  domsGradeOptionId?: number | null
  domsGradeId?: string | null
}

type ReplayPumpMapping = {
  nozzles?: ReplayNozzleMapping[] | null
}

const toConfiguredNozzleNumber = (value: unknown): number | null => {
  if (value == null || String(value).trim() === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null
}

export const JPL_TRANSACTION_BUFFER_SUBCODES = ['03H', '01H', '00H'] as const

export type JplTransactionBufferSubCode =
  (typeof JPL_TRANSACTION_BUFFER_SUBCODES)[number]

export type JplTransactionBufferResponseName =
  | 'FpSupTransBufStatus_resp'
  | 'FpUnSupTransBufStatus_resp'

export type TransactionLockOwnership = 'unlocked' | 'owned' | 'foreign'

export type TransactionReplayAction =
  | 'read'
  | 'resume_clear'
  | 'unlock_then_read'
  | 'block_foreign'

const normalizePositiveInteger = (value: unknown, field: string): number => {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`${field} must be a non-negative finite number`)
  }
  return Math.trunc(parsed)
}

export const normalizeJplId2 = (value: unknown): string =>
  String(normalizePositiveInteger(value, 'JPL ID2')).padStart(2, '0')

export const normalizeJplDec4 = (value: unknown): string =>
  String(normalizePositiveInteger(value, 'JPL DEC4')).padStart(4, '0')

export const normalizeTransactionBufferSubCode = (
  value: unknown,
): JplTransactionBufferSubCode | null => {
  const normalized = String(value ?? '')
    .trim()
    .toUpperCase()
  return JPL_TRANSACTION_BUFFER_SUBCODES.includes(
    normalized as JplTransactionBufferSubCode,
  )
    ? (normalized as JplTransactionBufferSubCode)
    : null
}

export const buildTransactionBufferEventType = (
  name: JplTransactionBufferResponseName,
  subCode: unknown,
): string => {
  const normalized = normalizeTransactionBufferSubCode(subCode)
  return normalized ? `${name}_${normalized}` : name
}

export const buildTransactionReplayKey = (args: {
  stationId: string
  sourceMode: BufferMode
  fpId: unknown
  transSeqNo: unknown
}): string => {
  const stationId = String(args.stationId ?? '').trim()
  if (!stationId) throw new Error('stationId is required for replay identity')

  return [
    stationId,
    args.sourceMode,
    normalizeJplId2(args.fpId),
    normalizeJplDec4(args.transSeqNo),
  ].join(':')
}

export const buildTransactionCaptureKey = (args: {
  stationId: string
  sourceMode: BufferMode
  fpId: unknown
  transSeqNo: unknown
}): string => `capture:${buildTransactionReplayKey(args)}`

export const buildTransactionPumpLockKey = (args: {
  stationId: string
  sourceMode: BufferMode
  fpId: unknown
}): string => {
  const stationId = String(args.stationId ?? '').trim()
  if (!stationId)
    throw new Error('stationId is required for replay lock identity')

  return [stationId, args.sourceMode, normalizeJplId2(args.fpId)].join(':')
}

export const classifyTransactionLockOwnership = (args: {
  lockId: unknown
  currentPosId: unknown
}): TransactionLockOwnership => {
  const lockId = String(args.lockId ?? '').trim()
  if (!lockId || normalizeJplId2(lockId) === '00') return 'unlocked'

  return normalizeJplId2(lockId) === normalizeJplId2(args.currentPosId)
    ? 'owned'
    : 'foreign'
}

export const resolveTransactionReplayAction = (args: {
  lockId: unknown
  currentPosId: unknown
  hasDurableClearPayload: boolean
}): TransactionReplayAction => {
  const ownership = classifyTransactionLockOwnership(args)
  if (ownership === 'foreign') return 'block_foreign'
  if (ownership === 'unlocked') return 'read'
  return args.hasDurableClearPayload ? 'resume_clear' : 'unlock_then_read'
}

export const DEFAULT_RECENT_CLEAR_STALE_GRACE_MS = 30_000

export const shouldSuppressRecentlyClearedOwnedReplay = (args: {
  lockId: unknown
  currentPosId: unknown
  replayStage: unknown
  clearedAt: unknown
  nowMs?: number
  graceMs?: number
}): boolean => {
  if (args.replayStage !== 'cleared') return false
  if (classifyTransactionLockOwnership(args) !== 'owned') return false

  const clearedAtMs = Date.parse(String(args.clearedAt ?? ''))
  if (!Number.isFinite(clearedAtMs)) return false

  const nowMs = Number(args.nowMs ?? Date.now())
  if (!Number.isFinite(nowMs)) return false

  const graceMs = Math.max(
    0,
    Number.isFinite(Number(args.graceMs))
      ? Number(args.graceMs)
      : DEFAULT_RECENT_CLEAR_STALE_GRACE_MS,
  )
  const ageMs = nowMs - clearedAtMs
  return ageMs >= 0 && ageMs <= graceMs
}

export const isTransactionReplayMappingReady = (
  mapping: ReplayPumpMapping | null | undefined,
): boolean => {
  const nozzles = Array.isArray(mapping?.nozzles) ? mapping.nozzles : []
  if (!nozzles.length) return false

  return nozzles.every((nozzle) => {
    const nozzleId = String(nozzle?.nozzleId ?? '').trim()
    const productCode = String(nozzle?.productCode ?? '').trim()
    const nozzleNumber = toConfiguredNozzleNumber(nozzle?.nozzleNumber)
    return Boolean(nozzleId && nozzleNumber != null && productCode)
  })
}

export const resolveReplayNozzleMapping = (args: {
  mapping: ReplayPumpMapping | null | undefined
  nozzleNumber?: unknown
  gradeId?: unknown
  gradeOptionId?: unknown
}): ReplayNozzleMapping | null => {
  const nozzles = Array.isArray(args.mapping?.nozzles)
    ? args.mapping.nozzles
    : []
  if (!nozzles.length) return null

  const nozzleNumber = toConfiguredNozzleNumber(args.nozzleNumber)
  if (nozzleNumber != null) {
    return (
      nozzles.find((nozzle) => Number(nozzle?.nozzleNumber) === nozzleNumber) ??
      null
    )
  }

  // FpGradeOptionNo identifies the actual option/nozzle on a multi-product
  // dispenser and is therefore stronger evidence than FcGradeId. Two nozzles
  // can legitimately deliver the same grade from different tanks.
  const gradeOptionId = String(args.gradeOptionId ?? '').trim()
  if (gradeOptionId) {
    const byOption = nozzles.filter(
      (nozzle) =>
        String(nozzle?.domsGradeOptionId ?? '').trim() === gradeOptionId,
    )
    if (byOption.length === 1) return byOption[0]
    if (byOption.length > 1) return null
  }

  const gradeId = String(args.gradeId ?? '').trim()
  if (gradeId) {
    const byGrade = nozzles.filter(
      (nozzle) => String(nozzle?.domsGradeId ?? '').trim() === gradeId,
    )
    if (byGrade.length === 1) return byGrade[0]
    if (byGrade.length > 1) return null
  }

  return nozzles.length === 1 ? nozzles[0] : null
}

export const describeIdZeroRecoveryPolicy = () => ({
  automaticRelease: false,
  requiredPosId: '00',
  policy:
    'ID_ZERO unlock is restricted to an explicit operator/field recovery procedure after the transaction has been durably captured or independently verified. Normal replay and automatic startup recovery never release a foreign POS lock.',
})
