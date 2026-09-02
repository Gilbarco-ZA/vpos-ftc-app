import { createHash } from 'node:crypto'

export type DomsServiceMessageRecord = {
  stationId: string
  seqNo?: string
  message?: string
  payloadJson?: Record<string, unknown> | null
  sourceHash: string
}

export type DomsBackOfficeRecord = {
  stationId: string
  seqNo?: string
  formatId?: string
  subCode: string
  payloadJson: Record<string, unknown>
  borData?: string | null
  borLength?: number | null
  sourceHash: string
}

const stableStringify = (value: unknown): string => {
  if (value == null) return ''
  if (typeof value !== 'object') return String(value)
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableStringify(entry)).join(',')}]`
  }

  return `{${Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, entry]) => `${JSON.stringify(key)}:${stableStringify(entry)}`)
    .join(',')}}`
}

export const hashDomsSpecialRecord = (...parts: unknown[]) =>
  createHash('sha256')
    .update(parts.map((part) => stableStringify(part)).join('|'))
    .digest('hex')

const parseOptionalInt = (value: unknown): number | null => {
  if (value == null || value === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? Math.trunc(parsed) : null
}

export const normalizeDomsServiceMessageRecord = (args: {
  stationId: string
  seqNo: unknown
  message: unknown
  payload?: Record<string, unknown> | null
}): DomsServiceMessageRecord => {
  const normalizedSeqNo =
    args.seqNo != null ? String(args.seqNo).trim() : undefined
  const seqNo = normalizedSeqNo || undefined
  const message =
    args.message != null ? String(args.message).trimEnd() : undefined
  const payloadJson = args.payload ?? null

  return {
    stationId: args.stationId,
    seqNo,
    message,
    payloadJson,
    sourceHash: hashDomsSpecialRecord('service', seqNo, message, payloadJson),
  }
}

export const normalizeDomsBackOfficeRecord = (args: {
  stationId: string
  subCode: string
  payload: Record<string, unknown>
}): DomsBackOfficeRecord => {
  const payload = args.payload ?? {}
  const rawFormatId = (payload as any)?.BorFormatId
  const formatId = String(rawFormatId?.value ?? rawFormatId ?? '').trim()
  const seqNo = String((payload as any)?.BorSeqNo ?? '').trim()
  const borData =
    (payload as any)?.BorData != null ? String((payload as any).BorData) : null
  const borLength = parseOptionalInt(
    (payload as any)?.BorLength ?? (payload as any)?.BorLen,
  )

  return {
    stationId: args.stationId,
    seqNo: seqNo || undefined,
    formatId: formatId || undefined,
    subCode: String(args.subCode || '00H')
      .trim()
      .toUpperCase(),
    payloadJson: payload,
    borData,
    borLength,
    sourceHash: hashDomsSpecialRecord(
      'bor',
      seqNo,
      formatId,
      args.subCode,
      borData,
      payload,
    ),
  }
}

export const isEmptyDomsBackOfficeRecord = (record: {
  subCode?: string
  seqNo?: string
  payloadJson?: Record<string, unknown>
  borData?: string | null
  borLength?: number | null
}) => {
  const subCode = String(record.subCode ?? '').toUpperCase()
  const payload = record.payloadJson ?? {}
  if (!record.seqNo) return true
  if (subCode === '00H') {
    return Number((payload as any)?.BorLen ?? record.borLength ?? 0) <= 0
  }
  if (subCode === '01H') {
    return Number((payload as any)?.BorLength ?? record.borLength ?? 0) <= 0
  }
  if (subCode === '02H') {
    return !String((payload as any)?.BorData ?? record.borData ?? '').trim()
  }
  return false
}
