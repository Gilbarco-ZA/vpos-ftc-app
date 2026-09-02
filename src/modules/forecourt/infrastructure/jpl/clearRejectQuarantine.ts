import '@/src/modules/forecourt/infrastructure/jpl/globals'

import type { BufferMode } from '@/src/modules/forecourt/infrastructure/jpl/types'

export type JplClearRejectQuarantineEntry = {
  stationId: string
  sourceMode: BufferMode
  fpId: number
  transSeqNo: number
  rejectCode: string
  rejectInfo: string
  rejectInfoText: string
  rejectedExtendedMsgCode: string
  rejectedMsgSubc: string
  correlationId: string | null
  quarantinedAt: number
}

type QuarantineKeyArgs = {
  stationId: string
  sourceMode: BufferMode
  fpId: number
  transSeqNo: number
}

const normalizeHexCode = (value: unknown) =>
  String(value ?? '')
    .trim()
    .toUpperCase()

const getRejectData = (error: unknown): Record<string, unknown> | null => {
  const candidate = error as {
    details?: { raw?: { data?: Record<string, unknown> } }
    rejectMessage?: { data?: Record<string, unknown> }
    data?: Record<string, unknown>
    response?: { data?: Record<string, unknown> }
    cause?: { data?: Record<string, unknown> }
  }

  // @gilbarcoafs/doms-pos-jpl RejectError preserves the PSS reject envelope
  // under details.raw. Prefer that authoritative structure before legacy shapes.
  return (
    candidate?.details?.raw?.data ??
    candidate?.rejectMessage?.data ??
    candidate?.data ??
    candidate?.response?.data ??
    candidate?.cause?.data ??
    null
  )
}

const getRejectCode = (data: Record<string, unknown> | null) => {
  const rejectCode = data?.RejectCode as
    | { value?: unknown; enum?: Record<string, unknown> }
    | undefined
  return normalizeHexCode(
    rejectCode?.value ?? rejectCode?.enum?.syntax_error ?? data?.rejectCode,
  )
}

const buildQuarantineKey = (args: QuarantineKeyArgs) =>
  [
    String(args.stationId ?? '').trim(),
    args.sourceMode,
    String(Math.trunc(args.fpId)).padStart(2, '0'),
    String(Math.trunc(args.transSeqNo)).padStart(4, '0'),
  ].join(':')

const ensureQuarantine = () => {
  if (!globalThis.__jplClearRejectQuarantine) {
    globalThis.__jplClearRejectQuarantine = new Map()
  }
  return globalThis.__jplClearRejectQuarantine
}

export const isDeterministicSupervisedClearRxSizeReject = (
  error: unknown,
): boolean => {
  const data = getRejectData(error)
  if (!data) return false

  const rejectCode = getRejectCode(data)
  const rejectInfo = normalizeHexCode(data.RejectInfo ?? data.rejectInfo)
  const rejectInfoText = String(
    data.RejectInfoText ?? data.rejectInfoText ?? '',
  )
    .trim()
    .toLowerCase()
  const rejectedExtendedMsgCode = normalizeHexCode(
    data.RejectedExtendedMsgCode ?? data.rejectedExtendedMsgCode,
  )
  const rejectedMsgSubc = normalizeHexCode(
    data.RejectedMsgSubc ?? data.rejectedMsgSubc,
  )

  return (
    rejectedExtendedMsgCode === '0031H' &&
    rejectedMsgSubc === '04H' &&
    rejectCode === '02H' &&
    (rejectInfo === '09H' || rejectInfoText === 'wrong rx_size')
  )
}

export const quarantineDeterministicSupervisedClearReject = (args: {
  stationId: string
  fpId: number
  transSeqNo: number
  error: unknown
}): JplClearRejectQuarantineEntry | null => {
  if (!isDeterministicSupervisedClearRxSizeReject(args.error)) return null

  const data = getRejectData(args.error)
  if (!data) return null

  const error = args.error as {
    correlationId?: unknown
    details?: { raw?: { correlationId?: unknown } }
  }
  const correlationId =
    error?.correlationId ?? error?.details?.raw?.correlationId ?? null
  const entry: JplClearRejectQuarantineEntry = {
    stationId: String(args.stationId ?? '').trim(),
    sourceMode: 'supervised',
    fpId: Math.trunc(args.fpId),
    transSeqNo: Math.trunc(args.transSeqNo),
    rejectCode: getRejectCode(data),
    rejectInfo: normalizeHexCode(data.RejectInfo ?? data.rejectInfo),
    rejectInfoText: String(
      data.RejectInfoText ?? data.rejectInfoText ?? 'Wrong rx_size',
    ).trim(),
    rejectedExtendedMsgCode: normalizeHexCode(
      data.RejectedExtendedMsgCode ?? data.rejectedExtendedMsgCode,
    ),
    rejectedMsgSubc: normalizeHexCode(
      data.RejectedMsgSubc ?? data.rejectedMsgSubc,
    ),
    correlationId: correlationId == null ? null : String(correlationId),
    quarantinedAt: Date.now(),
  }

  ensureQuarantine().set(buildQuarantineKey(entry), entry)
  return entry
}

export const getClearRejectQuarantineEntry = (
  args: QuarantineKeyArgs,
): JplClearRejectQuarantineEntry | null =>
  ensureQuarantine().get(buildQuarantineKey(args)) ?? null

export const pruneClearRejectQuarantineForBufferSnapshot = (args: {
  stationId: string
  sourceMode: BufferMode
  fpId: number
  presentTransSeqNos: number[]
}): number => {
  const present = new Set(
    args.presentTransSeqNos
      .filter((value) => Number.isFinite(value))
      .map((value) => Math.trunc(value)),
  )
  const quarantine = ensureQuarantine()
  let removed = 0

  for (const [key, entry] of quarantine.entries()) {
    if (
      entry.stationId !== String(args.stationId ?? '').trim() ||
      entry.sourceMode !== args.sourceMode ||
      entry.fpId !== Math.trunc(args.fpId) ||
      present.has(entry.transSeqNo)
    ) {
      continue
    }
    quarantine.delete(key)
    removed += 1
  }

  return removed
}

export const resetClearRejectQuarantine = (stationId?: string): number => {
  const quarantine = ensureQuarantine()
  const normalizedStationId = String(stationId ?? '').trim()

  if (!normalizedStationId) {
    const removed = quarantine.size
    quarantine.clear()
    return removed
  }

  let removed = 0
  for (const [key, entry] of quarantine.entries()) {
    if (entry.stationId !== normalizedStationId) continue
    quarantine.delete(key)
    removed += 1
  }
  return removed
}

export const getClearRejectQuarantineSnapshot = (
  stationId?: string,
): JplClearRejectQuarantineEntry[] => {
  const normalizedStationId = String(stationId ?? '').trim()
  return Array.from(ensureQuarantine().values())
    .filter(
      (entry) =>
        !normalizedStationId || entry.stationId === normalizedStationId,
    )
    .sort((a, b) => a.quarantinedAt - b.quarantinedAt)
}
