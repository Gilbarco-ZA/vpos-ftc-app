import type { SessionUser } from '@/src/shared/types'

import { createAuditLog } from '@/src/platform/security/audit/audit-log.repository'
import { requireNonEmptyString } from '@/src/shared/utils/inputs'

import { recordForecourtEvent } from '../infrastructure/persistence'
import {
  getNozzleByPumpGradeOption,
  getNozzleMappingRow,
  getPumpByDomsFpId,
  getPumpMappingRow,
  getTankByDomsTankId,
  getTankMappingRow,
  updateNozzleDomsMapping,
  updatePumpDomsFpId,
  updateTankDomsTankId,
} from '../infrastructure/reconciliationMappingsRepo'

type EntityType = 'pump' | 'tank' | 'nozzle'

type MappingPayload = {
  domsFpId?: unknown
  doms_fp_id?: unknown
  domsTankId?: unknown
  doms_tank_id?: unknown
  domsGradeOptionId?: unknown
  doms_grade_option_id?: unknown
  domsGradeId?: unknown
  doms_grade_id?: unknown
}

export type ApplyDomsMappingRemediationInput = {
  entityType?: unknown
  entityId?: unknown
  mapping?: MappingPayload | null
  confirmPhysicalMapping?: unknown
  confirmationNote?: unknown
  sourceSuggestionCode?: unknown
}

const parseEntityType = (value: unknown): EntityType => {
  const normalized = String(value ?? '')
    .trim()
    .toLowerCase()
  if (
    normalized === 'pump' ||
    normalized === 'tank' ||
    normalized === 'nozzle'
  ) {
    return normalized
  }
  throw new Error('entityType must be pump, tank, or nozzle')
}

const getMappingValue = (
  mapping: MappingPayload,
  camel: keyof MappingPayload,
  snake: keyof MappingPayload,
) => {
  return mapping[camel] ?? mapping[snake]
}

const isAsciiDigitText = (value: string) => {
  if (!value) return false
  for (const char of value) {
    const code = char.charCodeAt(0)
    if (code < 48 || code > 57) return false
  }
  return true
}

const isSafeDomsText = (value: string) => {
  if (!value) return false
  for (const char of value) {
    const code = char.charCodeAt(0)
    const isNumber = code >= 48 && code <= 57
    const isUpperAlpha = code >= 65 && code <= 90
    const isLowerAlpha = code >= 97 && code <= 122
    const isAllowedPunctuation =
      char === '_' || char === '.' || char === ':' || char === '-'
    if (!isNumber && !isUpperAlpha && !isLowerAlpha && !isAllowedPunctuation) {
      return false
    }
  }
  return true
}

const parsePositiveInt = (value: unknown, fieldName: string, max = 99) => {
  const text = String(value ?? '').trim()
  if (!text) throw new Error(`${fieldName} is required`)
  if (!isAsciiDigitText(text)) throw new Error(`${fieldName} must be numeric`)
  const parsed = Number.parseInt(text, 10)
  if (!Number.isFinite(parsed) || parsed <= 0 || parsed > max) {
    throw new Error(`${fieldName} must be between 1 and ${max}`)
  }
  return parsed
}

const parseDomsText = (value: unknown, fieldName: string, maxLength = 32) => {
  const text = String(value ?? '').trim()
  if (!text) throw new Error(`${fieldName} is required`)
  if (text.length > maxLength) {
    throw new Error(`${fieldName} must be ${maxLength} characters or less`)
  }
  if (!isSafeDomsText(text)) {
    throw new Error(`${fieldName} contains unsupported characters`)
  }
  return text
}

const parseOptionalDomsText = (
  value: unknown,
  fieldName: string,
  maxLength = 32,
) => {
  if (value == null || String(value).trim() === '') return undefined
  return parseDomsText(value, fieldName, maxLength)
}

const rowValues = (row: unknown, keys: string[]) => {
  const record = row as Record<string, unknown>
  const result: Record<string, unknown> = {}
  for (const key of keys) result[key] = record[key]
  return result
}

const requireConfirmation = (input: ApplyDomsMappingRemediationInput) => {
  if (input.confirmPhysicalMapping !== true) {
    throw new Error(
      'confirmPhysicalMapping must be true after checking the mapping against the physical site and PSS Configurator',
    )
  }
}

async function recordMappingAudit(params: {
  user: SessionUser
  entityType: EntityType
  entityId: string
  sourceSuggestionCode: string | null
  oldValues: Record<string, unknown>
  newValues: Record<string, unknown>
  confirmationNote: string | null
}) {
  await createAuditLog({
    stationId: params.user.stationId,
    userId: params.user.id,
    action: 'DOMS_MAPPING_UPDATED',
    entityType: `forecourt.${params.entityType}`,
    entityId: params.entityId,
    oldValues: params.oldValues,
    newValues: params.newValues,
    metadata: {
      source: 'doms-reconciliation-remediation',
      sourceSuggestionCode: params.sourceSuggestionCode,
      confirmationNote: params.confirmationNote,
      safetyBoundary:
        'FTC-side mapping update only. No DOMS/JPL install or clear-install command was sent.',
    },
  })

  await recordForecourtEvent({
    stationId: params.user.stationId,
    source: 'admin',
    eventType: 'doms.mapping_updated',
    payload: {
      entityType: params.entityType,
      entityId: params.entityId,
      userId: params.user.id,
      username: params.user.username,
      sourceSuggestionCode: params.sourceSuggestionCode,
      oldValues: params.oldValues,
      newValues: params.newValues,
      confirmationNote: params.confirmationNote,
      safetyBoundary:
        'FTC-side mapping update only. No DOMS/JPL install or clear-install command was sent.',
    },
  })
}

export async function applyDomsMappingRemediation(
  input: ApplyDomsMappingRemediationInput,
  user: SessionUser,
) {
  requireConfirmation(input)
  const entityType = parseEntityType(input.entityType)
  const entityId = requireNonEmptyString(input.entityId, 'entityId')
  const mapping =
    input.mapping && typeof input.mapping === 'object' ? input.mapping : {}
  const sourceSuggestionCode =
    typeof input.sourceSuggestionCode === 'string' &&
    input.sourceSuggestionCode.trim()
      ? input.sourceSuggestionCode.trim()
      : null
  const confirmationNote =
    typeof input.confirmationNote === 'string' && input.confirmationNote.trim()
      ? input.confirmationNote.trim().slice(0, 500)
      : null

  if (entityType === 'pump') {
    const oldRow = await getPumpMappingRow({
      stationId: user.stationId,
      pumpId: entityId,
    })
    if (!oldRow) throw new Error('Pump was not found for this station')

    const domsFpId = parsePositiveInt(
      getMappingValue(mapping, 'domsFpId', 'doms_fp_id'),
      'domsFpId',
      99,
    )
    const duplicate = await getPumpByDomsFpId({
      stationId: user.stationId,
      domsFpId,
      excludePumpId: entityId,
    })
    if (duplicate) {
      throw new Error(
        `DOMS FpId ${domsFpId} is already assigned to pump ${duplicate.pump_number}`,
      )
    }

    const updated = await updatePumpDomsFpId({
      stationId: user.stationId,
      pumpId: entityId,
      domsFpId,
    })
    if (!updated) throw new Error('Pump mapping update failed')

    const oldValues = rowValues(oldRow, [
      'doms_fp_id',
      'pump_number',
      'code',
      'name',
    ])
    const newValues = rowValues(updated, [
      'doms_fp_id',
      'pump_number',
      'code',
      'name',
    ])
    await recordMappingAudit({
      user,
      entityType,
      entityId,
      sourceSuggestionCode,
      oldValues,
      newValues,
      confirmationNote,
    })
    return { entityType, entityId, oldValues, newValues }
  }

  if (entityType === 'tank') {
    const oldRow = await getTankMappingRow({
      stationId: user.stationId,
      tankId: entityId,
    })
    if (!oldRow) throw new Error('Tank was not found for this station')

    const domsTankId = parseDomsText(
      getMappingValue(mapping, 'domsTankId', 'doms_tank_id'),
      'domsTankId',
      32,
    )
    const duplicate = await getTankByDomsTankId({
      stationId: user.stationId,
      domsTankId,
      excludeTankId: entityId,
    })
    if (duplicate) {
      throw new Error(
        `DOMS TankId ${domsTankId} is already assigned to tank ${duplicate.code ?? duplicate.name ?? duplicate.id}`,
      )
    }

    const updated = await updateTankDomsTankId({
      stationId: user.stationId,
      tankId: entityId,
      domsTankId,
    })
    if (!updated) throw new Error('Tank mapping update failed')

    const oldValues = rowValues(oldRow, ['doms_tank_id', 'code', 'name'])
    const newValues = rowValues(updated, ['doms_tank_id', 'code', 'name'])
    await recordMappingAudit({
      user,
      entityType,
      entityId,
      sourceSuggestionCode,
      oldValues,
      newValues,
      confirmationNote,
    })
    return { entityType, entityId, oldValues, newValues }
  }

  const oldRow = await getNozzleMappingRow({
    stationId: user.stationId,
    nozzleId: entityId,
  })
  if (!oldRow) throw new Error('Nozzle was not found for this station')

  const rawGradeOption = getMappingValue(
    mapping,
    'domsGradeOptionId',
    'doms_grade_option_id',
  )
  const rawGradeId = getMappingValue(mapping, 'domsGradeId', 'doms_grade_id')
  const rawTankId = getMappingValue(mapping, 'domsTankId', 'doms_tank_id')

  const domsGradeOptionId =
    rawGradeOption == null || String(rawGradeOption).trim() === ''
      ? undefined
      : parsePositiveInt(rawGradeOption, 'domsGradeOptionId', 99)
  const domsGradeId = parseOptionalDomsText(rawGradeId, 'domsGradeId', 32)
  const domsTankId = parseOptionalDomsText(rawTankId, 'domsTankId', 32)

  if (domsGradeOptionId == null && domsGradeId == null && domsTankId == null) {
    throw new Error('At least one nozzle DOMS mapping value is required')
  }

  if (domsGradeOptionId != null) {
    const duplicate = await getNozzleByPumpGradeOption({
      stationId: user.stationId,
      pumpId: oldRow.pump_id,
      domsGradeOptionId,
      excludeNozzleId: entityId,
    })
    if (duplicate) {
      throw new Error(
        `DOMS grade option ${domsGradeOptionId} is already assigned to nozzle ${duplicate.nozzle_number} on this pump`,
      )
    }
  }

  const updated = await updateNozzleDomsMapping({
    stationId: user.stationId,
    nozzleId: entityId,
    domsGradeOptionId,
    domsGradeId,
    domsTankId,
  })
  if (!updated) throw new Error('Nozzle mapping update failed')

  const keys = [
    'doms_grade_option_id',
    'doms_grade_id',
    'doms_tank_id',
    'nozzle_number',
  ]
  const oldValues = rowValues(oldRow, keys)
  const newValues = rowValues(updated, keys)
  await recordMappingAudit({
    user,
    entityType,
    entityId,
    sourceSuggestionCode,
    oldValues,
    newValues,
    confirmationNote,
  })
  return { entityType, entityId, oldValues, newValues }
}
