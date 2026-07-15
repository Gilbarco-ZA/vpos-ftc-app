import type { SessionUser } from '@/src/shared/types'

import { createAuditLog } from '@/src/platform/security/audit/audit-log.repository'
import { requireNonEmptyString } from '@/src/shared/utils/inputs'

import { recordForecourtEvent } from '../infrastructure/persistence'
import { getDomsMappingAuditRow } from '../infrastructure/reconciliationHistoryRepo'
import {
  getNozzleByPumpGradeOption,
  getNozzleMappingRow,
  getPumpByDomsFpId,
  getPumpMappingRow,
  getTankByDomsTankId,
  getTankMappingRow,
  setNozzleDomsMappingExact,
  setPumpDomsFpIdExact,
  setTankDomsTankIdExact,
} from '../infrastructure/reconciliationMappingsRepo'

export type RollbackDomsMappingRemediationInput = {
  auditLogId?: unknown
  confirmRollback?: unknown
  confirmationNote?: unknown
}

type EntityType = 'pump' | 'tank' | 'nozzle'

const asRecord = (value: unknown): Record<string, unknown> => {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>
  }
  return {}
}

const normalizeNullableText = (value: unknown) => {
  if (value == null) return null
  const text = String(value).trim()
  return text || null
}

const normalizeNullableNumber = (value: unknown) => {
  if (value == null || String(value).trim() === '') return null
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return null
  return Math.trunc(parsed)
}

const parseEntityType = (auditEntityType: string): EntityType => {
  const normalized = auditEntityType
    .replace(/^forecourt\./, '')
    .trim()
    .toLowerCase()
  if (
    normalized === 'pump' ||
    normalized === 'tank' ||
    normalized === 'nozzle'
  ) {
    return normalized
  }
  throw new Error(`Unsupported mapping entity type: ${auditEntityType}`)
}

const valuesEqual = (a: unknown, b: unknown) => {
  const aValue = a == null || String(a).trim() === '' ? null : String(a)
  const bValue = b == null || String(b).trim() === '' ? null : String(b)
  return aValue === bValue
}

const assertCurrentValuesMatchAudit = (
  currentValues: Record<string, unknown>,
  expectedValues: Record<string, unknown>,
  keys: string[],
) => {
  const mismatches = keys.filter(
    (key) => !valuesEqual(currentValues[key], expectedValues[key]),
  )
  if (mismatches.length > 0) {
    throw new Error(
      `Mapping has changed since the selected audit entry. Refresh reconciliation/history before rolling back. Changed fields: ${mismatches.join(', ')}`,
    )
  }
}

const pickValues = (row: unknown, keys: string[]) => {
  const record = row as Record<string, unknown>
  const result: Record<string, unknown> = {}
  for (const key of keys) result[key] = record[key] ?? null
  return result
}

async function recordRollbackAudit(params: {
  user: SessionUser
  entityType: EntityType
  entityId: string
  auditLogId: string
  oldValues: Record<string, unknown>
  newValues: Record<string, unknown>
  confirmationNote: string | null
}) {
  await createAuditLog({
    stationId: params.user.stationId,
    userId: params.user.id,
    action: 'DOMS_MAPPING_ROLLED_BACK',
    entityType: `forecourt.${params.entityType}`,
    entityId: params.entityId,
    oldValues: params.oldValues,
    newValues: params.newValues,
    metadata: {
      source: 'doms-reconciliation-rollback',
      rollbackOfAuditLogId: params.auditLogId,
      confirmationNote: params.confirmationNote,
      safetyBoundary:
        'FTC-side mapping rollback only. No DOMS/JPL install or clear-install command was sent.',
    },
  })

  await recordForecourtEvent({
    stationId: params.user.stationId,
    source: 'admin',
    eventType: 'doms.mapping_rolled_back',
    payload: {
      entityType: params.entityType,
      entityId: params.entityId,
      auditLogId: params.auditLogId,
      userId: params.user.id,
      username: params.user.username,
      oldValues: params.oldValues,
      newValues: params.newValues,
      confirmationNote: params.confirmationNote,
      safetyBoundary:
        'FTC-side mapping rollback only. No DOMS/JPL install or clear-install command was sent.',
    },
  })
}

export async function rollbackDomsMappingRemediation(
  input: RollbackDomsMappingRemediationInput,
  user: SessionUser,
) {
  if (input.confirmRollback !== true) {
    throw new Error(
      'confirmRollback must be true after confirming this rollback is still correct for the physical site and PSS Configurator',
    )
  }

  const auditLogId = requireNonEmptyString(input.auditLogId, 'auditLogId')
  const confirmationNote =
    typeof input.confirmationNote === 'string' && input.confirmationNote.trim()
      ? input.confirmationNote.trim().slice(0, 500)
      : null

  const auditRow = await getDomsMappingAuditRow({
    stationId: user.stationId,
    auditLogId,
  })
  if (!auditRow || !auditRow.entity_id) {
    throw new Error('Mapping audit entry was not found for this station')
  }

  const entityType = parseEntityType(auditRow.entity_type)
  const entityId = auditRow.entity_id
  const rollbackValues = asRecord(auditRow.old_values)
  const expectedCurrentValues = asRecord(auditRow.new_values)

  if (entityType === 'pump') {
    const current = await getPumpMappingRow({
      stationId: user.stationId,
      pumpId: entityId,
    })
    if (!current) throw new Error('Pump was not found for this station')
    const keys = ['doms_fp_id']
    assertCurrentValuesMatchAudit(
      pickValues(current, keys),
      expectedCurrentValues,
      keys,
    )

    const rollbackDomsFpId = normalizeNullableNumber(rollbackValues.doms_fp_id)
    if (rollbackDomsFpId != null) {
      const duplicate = await getPumpByDomsFpId({
        stationId: user.stationId,
        domsFpId: rollbackDomsFpId,
        excludePumpId: entityId,
      })
      if (duplicate) {
        throw new Error(
          `Rollback DOMS FpId ${rollbackDomsFpId} is already assigned to pump ${duplicate.pump_number}`,
        )
      }
    }

    const updated = await setPumpDomsFpIdExact({
      stationId: user.stationId,
      pumpId: entityId,
      domsFpId: rollbackDomsFpId,
    })
    if (!updated) throw new Error('Pump rollback failed')

    const oldValues = pickValues(current, [
      'doms_fp_id',
      'pump_number',
      'code',
      'name',
    ])
    const newValues = pickValues(updated, [
      'doms_fp_id',
      'pump_number',
      'code',
      'name',
    ])
    await recordRollbackAudit({
      user,
      entityType,
      entityId,
      auditLogId,
      oldValues,
      newValues,
      confirmationNote,
    })
    return {
      entityType,
      entityId,
      oldValues,
      newValues,
      rollbackOfAuditLogId: auditLogId,
    }
  }

  if (entityType === 'tank') {
    const current = await getTankMappingRow({
      stationId: user.stationId,
      tankId: entityId,
    })
    if (!current) throw new Error('Tank was not found for this station')
    const keys = ['doms_tank_id']
    assertCurrentValuesMatchAudit(
      pickValues(current, keys),
      expectedCurrentValues,
      keys,
    )

    const rollbackDomsTankId = normalizeNullableText(
      rollbackValues.doms_tank_id,
    )
    if (rollbackDomsTankId) {
      const duplicate = await getTankByDomsTankId({
        stationId: user.stationId,
        domsTankId: rollbackDomsTankId,
        excludeTankId: entityId,
      })
      if (duplicate) {
        throw new Error(
          `Rollback DOMS TankId ${rollbackDomsTankId} is already assigned to tank ${duplicate.code ?? duplicate.name ?? duplicate.id}`,
        )
      }
    }

    const updated = await setTankDomsTankIdExact({
      stationId: user.stationId,
      tankId: entityId,
      domsTankId: rollbackDomsTankId,
    })
    if (!updated) throw new Error('Tank rollback failed')

    const oldValues = pickValues(current, ['doms_tank_id', 'code', 'name'])
    const newValues = pickValues(updated, ['doms_tank_id', 'code', 'name'])
    await recordRollbackAudit({
      user,
      entityType,
      entityId,
      auditLogId,
      oldValues,
      newValues,
      confirmationNote,
    })
    return {
      entityType,
      entityId,
      oldValues,
      newValues,
      rollbackOfAuditLogId: auditLogId,
    }
  }

  const current = await getNozzleMappingRow({
    stationId: user.stationId,
    nozzleId: entityId,
  })
  if (!current) throw new Error('Nozzle was not found for this station')
  const keys = ['doms_grade_option_id', 'doms_grade_id', 'doms_tank_id']
  assertCurrentValuesMatchAudit(
    pickValues(current, keys),
    expectedCurrentValues,
    keys,
  )

  const rollbackGradeOptionId = normalizeNullableNumber(
    rollbackValues.doms_grade_option_id,
  )
  const rollbackGradeId = normalizeNullableText(rollbackValues.doms_grade_id)
  const rollbackTankId = normalizeNullableText(rollbackValues.doms_tank_id)

  if (rollbackGradeOptionId != null) {
    const duplicate = await getNozzleByPumpGradeOption({
      stationId: user.stationId,
      pumpId: current.pump_id,
      domsGradeOptionId: rollbackGradeOptionId,
      excludeNozzleId: entityId,
    })
    if (duplicate) {
      throw new Error(
        `Rollback DOMS grade option ${rollbackGradeOptionId} is already assigned to nozzle ${duplicate.nozzle_number} on this pump`,
      )
    }
  }

  const updated = await setNozzleDomsMappingExact({
    stationId: user.stationId,
    nozzleId: entityId,
    domsGradeOptionId: rollbackGradeOptionId,
    domsGradeId: rollbackGradeId,
    domsTankId: rollbackTankId,
  })
  if (!updated) throw new Error('Nozzle rollback failed')

  const oldValues = pickValues(current, [
    'doms_grade_option_id',
    'doms_grade_id',
    'doms_tank_id',
    'nozzle_number',
  ])
  const newValues = pickValues(updated, [
    'doms_grade_option_id',
    'doms_grade_id',
    'doms_tank_id',
    'nozzle_number',
  ])
  await recordRollbackAudit({
    user,
    entityType,
    entityId,
    auditLogId,
    oldValues,
    newValues,
    confirmationNote,
  })
  return {
    entityType,
    entityId,
    oldValues,
    newValues,
    rollbackOfAuditLogId: auditLogId,
  }
}
