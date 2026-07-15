import type { BufferMode } from '@/src/modules/forecourt/infrastructure/jpl/types'

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

export const describeIdZeroRecoveryPolicy = () => ({
  automaticRelease: false,
  requiredPosId: '00',
  policy:
    'ID_ZERO unlock is restricted to an explicit operator/field recovery procedure after the transaction has been durably captured or independently verified. Normal replay and automatic startup recovery never release a foreign POS lock.',
})
