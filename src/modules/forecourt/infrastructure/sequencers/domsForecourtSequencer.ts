import type { NormalizedTransaction } from '@/src/modules/forecourt/infrastructure/normalize'

import { normalizeForecourtEvent } from '@/src/modules/forecourt/infrastructure/normalize'

export type SequencerNozzleMapping = {
  nozzleId: string
  nozzleNumber: number
  fuelType?: string | null
  productCode?: string | null
}

export type SequencerPumpMapping = {
  pumpNumber: number
  nozzles: SequencerNozzleMapping[]
}

export type SequencerPumpStatus = {
  fpId: number
  pumpNumber: number
  state: string
  mapping?: SequencerPumpMapping
}

export type SequencerTransaction = {
  pumpNumber: number
  mapping?: SequencerPumpMapping
  nozzle?: SequencerNozzleMapping
  tx: NormalizedTransaction
}

export type DomsSequencerResult = {
  interested: boolean
  wantsPump: boolean
  wantsTrans: boolean
  pumpStatuses: SequencerPumpStatus[]
  transactions: SequencerTransaction[]
  hasPumpStatus: boolean
  transactionCount: number
  missingPumpStatusFpId: boolean
  rawPumpStatusFpId?: unknown
}

const lower = (value: unknown) =>
  String(value ?? '')
    .trim()
    .toLowerCase()

const mapDomsMainState = (value: unknown) => {
  const raw = lower(value)

  if (!raw) return 'idle'
  if (raw.includes('terminated')) return 'idle'
  if (raw.includes('preauthorized')) return 'auth'
  if (raw.includes('calling') || raw.includes('starting')) return 'nozzle_up'
  if (raw.includes('fuelling') || raw.includes('fueling')) return 'dispensing'
  if (raw.includes('idle') || raw.includes('closed')) return 'idle'
  if (raw.includes('unavailable')) return 'idle'
  return raw
}

const isPumpEvent = (eventType: string) => {
  const evt = lower(eventType)
  return evt.startsWith('fpstatus_') || evt.includes('fpstatus')
}

const isTransactionEvent = (eventType: string) => {
  const evt = lower(eventType)
  return (
    evt.startsWith('fpsuptransbufstatus_') ||
    evt.startsWith('fpunsuptransbufstatus_') ||
    evt.startsWith('fpunsuptrans_') ||
    evt.includes('transbufstatus') ||
    evt.includes('unsuptrans')
  )
}

const extractNozzleNumber = (payload: any): number | null => {
  const candidate =
    payload?.NozzleNumber ??
    payload?.nozzleNumber ??
    payload?.NozzleNo ??
    payload?.nozzle_no ??
    payload?.nozzle ??
    payload?.HoseId ??
    payload?.hoseId

  if (candidate == null) return null
  const num = Number(candidate)
  return Number.isFinite(num) ? num : null
}

const resolveNozzleSelection = (
  mapping: SequencerPumpMapping | undefined,
  payload: any,
): SequencerNozzleMapping | null => {
  if (!mapping || !mapping.nozzles.length) return null

  const nozzleNumber = extractNozzleNumber(payload)
  if (nozzleNumber != null) {
    const match = mapping.nozzles.find(
      (nozzle) => nozzle.nozzleNumber === nozzleNumber,
    )
    if (match) return match
  }

  if (mapping.nozzles.length === 1) return mapping.nozzles[0]
  return mapping.nozzles[0] ?? null
}

export class DomsForecourtSequencer {
  ingest(
    eventType: string,
    payload: any,
    mappings: Map<number, SequencerPumpMapping>,
  ): DomsSequencerResult {
    const wantsPump = isPumpEvent(eventType)
    const wantsTrans = isTransactionEvent(eventType)

    if (!wantsPump && !wantsTrans) {
      return {
        interested: false,
        wantsPump,
        wantsTrans,
        pumpStatuses: [],
        transactions: [],
        hasPumpStatus: false,
        transactionCount: 0,
        missingPumpStatusFpId: false,
      }
    }

    const normalization = normalizeForecourtEvent(eventType, payload)

    const pumpStatuses: SequencerPumpStatus[] = []
    let missingPumpStatusFpId = false
    let rawPumpStatusFpId: unknown

    if (normalization.pumpStatus) {
      const pumpNumber = Number(normalization.pumpStatus.fpId)
      if (Number.isFinite(pumpNumber)) {
        pumpStatuses.push({
          fpId: normalization.pumpStatus.fpId,
          pumpNumber,
          state: mapDomsMainState(normalization.pumpStatus.status),
          mapping: mappings.get(pumpNumber),
        })
      } else {
        missingPumpStatusFpId = true
        rawPumpStatusFpId = normalization.pumpStatus.fpId
      }
    }

    const transactions: SequencerTransaction[] = []
    if (normalization.transactions?.length) {
      for (const tx of normalization.transactions) {
        const pumpNumber = tx.fpId != null ? Number(tx.fpId) : NaN
        if (!Number.isFinite(pumpNumber)) continue
        const mapping = mappings.get(pumpNumber)
        const nozzle = resolveNozzleSelection(mapping, payload)
        transactions.push({
          pumpNumber,
          mapping,
          nozzle: nozzle ?? undefined,
          tx,
        })
      }
    }

    return {
      interested: true,
      wantsPump,
      wantsTrans,
      pumpStatuses,
      transactions,
      hasPumpStatus: Boolean(normalization.pumpStatus),
      transactionCount: normalization.transactions?.length ?? 0,
      missingPumpStatusFpId,
      rawPumpStatusFpId,
    }
  }
}
