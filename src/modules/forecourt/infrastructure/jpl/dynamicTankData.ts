import { createHash, randomUUID } from 'crypto'

import {
  normalizeJplCode1,
  normalizeJplFcDateTime,
  normalizeJplId2,
} from '@/src/modules/forecourt/infrastructure/jpl/protocol/types'

const toTrimmed = (value: unknown) => String(value ?? '').trim()

const MAX_DYNAMIC_TANK_TEXT_LENGTH = 80

export type DomsDynamicTankDataSeverity = 'info' | 'warning' | 'critical'
export type DomsDynamicTankDataStatus = 'requested' | 'sent' | 'failed'

export type NormalizedDomsEnteredDensity = {
  DensityValue: string
  ExpireDateAndTime: string
  ScrollingSpeed: string
  Text: string
}

export type NormalizedDomsDynamicTankDataRequest = {
  id: string
  tankId: string
  dtdPars: {
    EnteredDensity: NormalizedDomsEnteredDensity
  }
  requestedBy?: string | null
  requestedRole?: string | null
  reason?: string | null
  source?: string | null
  severity: DomsDynamicTankDataSeverity
  validationWarnings: string[]
  sourceHash: string
  payloadJson: Record<string, unknown>
}

export type NormalizeDomsDynamicTankDataInput = {
  tankId?: unknown
  TankId?: unknown
  dtdPars?: unknown
  DtdPars?: unknown
  enteredDensity?: unknown
  EnteredDensity?: unknown
  densityValue?: unknown
  DensityValue?: unknown
  expireDateAndTime?: unknown
  ExpireDateAndTime?: unknown
  scrollingSpeed?: unknown
  ScrollingSpeed?: unknown
  text?: unknown
  Text?: unknown
  requestedBy?: unknown
  userId?: unknown
  issuedBy?: unknown
  requestedRole?: unknown
  userRole?: unknown
  role?: unknown
  reason?: unknown
  comment?: unknown
  source?: unknown
}

const stableJson = (value: unknown): string => {
  if (value == null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value))
    return `[${value.map((entry) => stableJson(entry)).join(',')}]`
  const entries = Object.entries(value as Record<string, unknown>).sort(
    ([a], [b]) => a.localeCompare(b),
  )
  return `{${entries
    .map(([key, entry]) => `${JSON.stringify(key)}:${stableJson(entry)}`)
    .join(',')}}`
}

export const hashDomsDynamicTankData = (value: unknown) =>
  createHash('sha256').update(stableJson(value)).digest('hex')

const normalizeDensityValue = (value: unknown) => {
  const raw = toTrimmed(value)
  if (!/^\d{1,12}$/.test(raw)) {
    throw new Error(
      'EnteredDensity.DensityValue must be a 1-12 digit numeric string',
    )
  }
  if (Number(raw) <= 0) {
    throw new Error('EnteredDensity.DensityValue must be greater than zero')
  }
  return raw.padStart(12, '0')
}

const normalizeText = (value: unknown) =>
  toTrimmed(value)
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s+/g, ' ')
    .slice(0, MAX_DYNAMIC_TANK_TEXT_LENGTH)

const extractEnteredDensity = (input: NormalizeDomsDynamicTankDataInput) => {
  const dtdPars =
    input.dtdPars &&
    typeof input.dtdPars === 'object' &&
    !Array.isArray(input.dtdPars)
      ? (input.dtdPars as Record<string, unknown>)
      : input.DtdPars &&
          typeof input.DtdPars === 'object' &&
          !Array.isArray(input.DtdPars)
        ? (input.DtdPars as Record<string, unknown>)
        : {}

  const unsupportedKeys = Object.keys(dtdPars).filter(
    (key) => key !== 'EnteredDensity' && key !== 'enteredDensity',
  )
  if (unsupportedKeys.length) {
    throw new Error(
      `Unsupported dynamic tank data parameter(s): ${unsupportedKeys.join(', ')}. Only EnteredDensity is currently allowed.`,
    )
  }

  const nested =
    dtdPars.EnteredDensity &&
    typeof dtdPars.EnteredDensity === 'object' &&
    !Array.isArray(dtdPars.EnteredDensity)
      ? (dtdPars.EnteredDensity as Record<string, unknown>)
      : dtdPars.enteredDensity &&
          typeof dtdPars.enteredDensity === 'object' &&
          !Array.isArray(dtdPars.enteredDensity)
        ? (dtdPars.enteredDensity as Record<string, unknown>)
        : input.enteredDensity &&
            typeof input.enteredDensity === 'object' &&
            !Array.isArray(input.enteredDensity)
          ? (input.enteredDensity as Record<string, unknown>)
          : input.EnteredDensity &&
              typeof input.EnteredDensity === 'object' &&
              !Array.isArray(input.EnteredDensity)
            ? (input.EnteredDensity as Record<string, unknown>)
            : {}

  return {
    DensityValue:
      nested.DensityValue ??
      nested.densityValue ??
      input.DensityValue ??
      input.densityValue,
    ExpireDateAndTime:
      nested.ExpireDateAndTime ??
      nested.expireDateAndTime ??
      input.ExpireDateAndTime ??
      input.expireDateAndTime,
    ScrollingSpeed:
      nested.ScrollingSpeed ??
      nested.scrollingSpeed ??
      input.ScrollingSpeed ??
      input.scrollingSpeed ??
      '00H',
    Text: nested.Text ?? nested.text ?? input.Text ?? input.text ?? '',
  }
}

const classifySeverity = (args: {
  expireDateAndTime: string
  requestedRole?: string | null
  reason?: string | null
}) => {
  if (
    args.requestedRole &&
    !['administrator', 'field_engineer'].includes(args.requestedRole)
  ) {
    return 'critical' as const
  }
  if (!args.reason) return 'warning' as const
  if (args.expireDateAndTime === '00000000000000') return 'warning' as const
  return 'info' as const
}

export const normalizeDomsDynamicTankDataRequest = (
  input: NormalizeDomsDynamicTankDataInput,
): NormalizedDomsDynamicTankDataRequest => {
  const tankId = normalizeJplId2(input.TankId ?? input.tankId)
  const rawDensity = extractEnteredDensity(input)
  const density = {
    DensityValue: normalizeDensityValue(rawDensity.DensityValue),
    ExpireDateAndTime: normalizeJplFcDateTime(rawDensity.ExpireDateAndTime),
    ScrollingSpeed: normalizeJplCode1(rawDensity.ScrollingSpeed, '00H'),
    Text: normalizeText(rawDensity.Text),
  }

  const reason = toTrimmed(input.reason ?? input.comment) || null
  const requestedRole =
    toTrimmed(input.requestedRole ?? input.userRole ?? input.role) || null
  const requestedBy =
    toTrimmed(input.requestedBy ?? input.userId ?? input.issuedBy) || null
  const source = toTrimmed(input.source) || null
  const validationWarnings: string[] = []

  if (!reason) {
    validationWarnings.push(
      'A business reason should be captured for manual dynamic tank data changes.',
    )
  }
  if (
    requestedRole &&
    !['administrator', 'field_engineer'].includes(requestedRole)
  ) {
    validationWarnings.push(
      'Only administrators or field engineers should send live dynamic tank data changes.',
    )
  }
  if (!density.Text) {
    validationWarnings.push(
      'EnteredDensity.Text is empty; consider including operator-facing context.',
    )
  }

  const payloadJson = {
    TankId: tankId,
    DtdPars: {
      EnteredDensity: density,
    },
  }
  const sourceHash = hashDomsDynamicTankData({
    payloadJson,
    requestedBy,
    reason,
  })

  return {
    id: randomUUID(),
    tankId,
    dtdPars: payloadJson.DtdPars,
    requestedBy,
    requestedRole,
    reason,
    source,
    severity: classifySeverity({
      expireDateAndTime: density.ExpireDateAndTime,
      requestedRole,
      reason,
    }),
    validationWarnings,
    sourceHash,
    payloadJson,
  }
}

export const buildDynamicTankDataAuditPatch = (
  normalized: NormalizedDomsDynamicTankDataRequest,
) => ({
  id: normalized.id,
  tankId: normalized.tankId,
  requestedBy: normalized.requestedBy,
  requestedRole: normalized.requestedRole,
  reason: normalized.reason,
  source: normalized.source,
  severity: normalized.severity,
  validationWarnings: normalized.validationWarnings,
  sourceHash: normalized.sourceHash,
  payloadJson: normalized.payloadJson,
})
