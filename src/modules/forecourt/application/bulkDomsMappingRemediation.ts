import type { SessionUser } from '@/src/shared/types'

import { createAuditLog } from '@/src/platform/security/audit/audit-log.repository'
import { requireNonEmptyString } from '@/src/shared/utils/inputs'

import type { ApplyDomsMappingRemediationInput } from './applyDomsMappingRemediation'
import { recordForecourtEvent } from '../infrastructure/persistence'
import {
  getNozzleByPumpGradeOption,
  getNozzleMappingRow,
  getPumpByDomsFpId,
  getTankByDomsTankId,
} from '../infrastructure/reconciliationMappingsRepo'
import { applyDomsMappingRemediation } from './applyDomsMappingRemediation'
import { getDomsConfigurationReconciliation } from './getDomsConfigurationReconciliation'

type EntityType = 'pump' | 'tank' | 'nozzle'
type BulkMode = 'dry-run' | 'apply'

type BulkMappingInputItem = {
  entityType?: unknown
  entity_type?: unknown
  entityId?: unknown
  entity_id?: unknown
  id?: unknown
  pumpId?: unknown
  pump_id?: unknown
  tankId?: unknown
  tank_id?: unknown
  nozzleId?: unknown
  nozzle_id?: unknown
  domsFpId?: unknown
  doms_fp_id?: unknown
  domsTankId?: unknown
  doms_tank_id?: unknown
  domsGradeOptionId?: unknown
  doms_grade_option_id?: unknown
  domsGradeId?: unknown
  doms_grade_id?: unknown
  sourceSuggestionCode?: unknown
  source_suggestion_code?: unknown
  note?: unknown
}

export type BulkDomsMappingRemediationInput = {
  mode?: unknown
  items?: unknown
  csvText?: unknown
  jsonText?: unknown
  confirmPhysicalMapping?: unknown
  confirmLivePreValidation?: unknown
  confirmBulkApply?: unknown
  confirmationNote?: unknown
}

type NormalizedBulkItem = {
  index: number
  source: 'items' | 'jsonText' | 'csvText'
  sourceLine?: number
  entityType: EntityType
  entityId: string
  mapping: Record<string, unknown>
  sourceSuggestionCode: string | null
  note: string | null
}

type BulkBlocker = {
  code: string
  message: string
  itemIndex?: number
  sourceLine?: number
  severity: 'error' | 'warning'
}

const CSV_HEADERS = [
  'entityType',
  'entityId',
  'domsFpId',
  'domsTankId',
  'domsGradeOptionId',
  'domsGradeId',
  'sourceSuggestionCode',
  'note',
]

const get = (
  item: Record<string, unknown>,
  ...keys: Array<keyof BulkMappingInputItem>
) => {
  for (const key of keys) {
    const value = item[key as string]
    if (value != null && String(value).trim() !== '') return value
  }
  return undefined
}

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === 'object' && !Array.isArray(value))

const parseMode = (value: unknown): BulkMode => {
  const mode = String(value ?? 'dry-run')
    .trim()
    .toLowerCase()
  if (mode === 'apply') return 'apply'
  return 'dry-run'
}

const parseEntityType = (value: unknown): EntityType => {
  const text = String(value ?? '')
    .trim()
    .toLowerCase()
  if (text === 'pump' || text === 'tank' || text === 'nozzle') return text
  throw new Error('entityType must be pump, tank, or nozzle')
}

const toText = (value: unknown, fieldName: string, maxLength = 120) => {
  const text = String(value ?? '').trim()
  if (!text) throw new Error(`${fieldName} is required`)
  if (text.length > maxLength) {
    throw new Error(`${fieldName} must be ${maxLength} characters or less`)
  }
  return text
}

const optionalText = (value: unknown, maxLength = 500) => {
  const text = String(value ?? '').trim()
  if (!text) return null
  return text.slice(0, maxLength)
}

const splitCsvLine = (line: string) => {
  const values: string[] = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i]
    const next = line[i + 1]

    if (char === '"' && inQuotes && next === '"') {
      current += '"'
      i += 1
      continue
    }

    if (char === '"') {
      inQuotes = !inQuotes
      continue
    }

    if (char === ',' && !inQuotes) {
      values.push(current.trim())
      current = ''
      continue
    }

    current += char
  }

  values.push(current.trim())
  return values
}

const parseCsvText = (
  csvText: string,
): Array<{
  item: Record<string, unknown>
  sourceLine: number
}> => {
  const lines = csvText
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .map((line, index) => ({ line, number: index + 1 }))
    .filter(({ line }) => line.trim())

  if (!lines.length) return []

  const first = splitCsvLine(lines[0].line)
  const normalizedFirst = first.map((header) => header.trim().toLowerCase())
  const hasHeader = normalizedFirst.some((header) =>
    ['entitytype', 'entity_type', 'entityid', 'entity_id'].includes(header),
  )
  const headers = hasHeader ? first : CSV_HEADERS
  const dataLines = hasHeader ? lines.slice(1) : lines

  return dataLines.map(({ line, number }) => {
    const values = splitCsvLine(line)
    const item: Record<string, unknown> = {}
    for (let i = 0; i < headers.length; i += 1) {
      const key = headers[i]?.trim()
      if (!key) continue
      item[key] = values[i] ?? ''
    }
    return { item, sourceLine: number }
  })
}

const parseJsonText = (
  jsonText: string,
): Array<{
  item: Record<string, unknown>
  sourceLine?: number
}> => {
  const parsed = JSON.parse(jsonText)
  const list = Array.isArray(parsed)
    ? parsed
    : Array.isArray(parsed?.items)
      ? parsed.items
      : []

  return list.filter(isPlainObject).map((item: any) => ({ item }))
}

const hasMappingValue = (mapping: Record<string, unknown>) =>
  Object.values(mapping).some(
    (value) => value != null && String(value).trim() !== '',
  )

const buildMapping = (
  entityType: EntityType,
  item: Record<string, unknown>,
) => {
  const mapping: Record<string, unknown> = {}

  if (entityType === 'pump') {
    mapping.domsFpId = get(item, 'domsFpId', 'doms_fp_id')
    return mapping
  }

  if (entityType === 'tank') {
    mapping.domsTankId = get(item, 'domsTankId', 'doms_tank_id')
    return mapping
  }

  const domsGradeOptionId = get(
    item,
    'domsGradeOptionId',
    'doms_grade_option_id',
  )
  const domsGradeId = get(item, 'domsGradeId', 'doms_grade_id')
  const domsTankId = get(item, 'domsTankId', 'doms_tank_id')
  if (domsGradeOptionId != null) mapping.domsGradeOptionId = domsGradeOptionId
  if (domsGradeId != null) mapping.domsGradeId = domsGradeId
  if (domsTankId != null) mapping.domsTankId = domsTankId
  return mapping
}

const normalizeItems = (
  rows: Array<{
    item: Record<string, unknown>
    source: NormalizedBulkItem['source']
    sourceLine?: number
  }>,
): { items: NormalizedBulkItem[]; blockers: BulkBlocker[] } => {
  const items: NormalizedBulkItem[] = []
  const blockers: BulkBlocker[] = []

  rows.forEach(({ item, source, sourceLine }, index) => {
    try {
      const entityType = parseEntityType(get(item, 'entityType', 'entity_type'))
      const entityId = toText(
        get(
          item,
          'entityId',
          'entity_id',
          'id',
          entityType === 'pump'
            ? 'pumpId'
            : entityType === 'tank'
              ? 'tankId'
              : 'nozzleId',
          entityType === 'pump'
            ? 'pump_id'
            : entityType === 'tank'
              ? 'tank_id'
              : 'nozzle_id',
        ),
        'entityId',
        80,
      )
      const mapping = buildMapping(entityType, item)
      if (!hasMappingValue(mapping)) {
        throw new Error('mapping values are required')
      }

      items.push({
        index,
        source,
        sourceLine,
        entityType,
        entityId,
        mapping,
        sourceSuggestionCode: optionalText(
          get(item, 'sourceSuggestionCode', 'source_suggestion_code'),
          120,
        ),
        note: optionalText(get(item, 'note'), 500),
      })
    } catch (err) {
      blockers.push({
        code: 'invalid-bulk-row',
        message: (err as Error)?.message || 'Invalid row',
        itemIndex: index,
        sourceLine,
        severity: 'error',
      })
    }
  })

  return { items, blockers }
}

export const parseBulkDomsMappingInput = (
  input: BulkDomsMappingRemediationInput | null | undefined,
) => {
  const rows: Array<{
    item: Record<string, unknown>
    source: NormalizedBulkItem['source']
    sourceLine?: number
  }> = []

  const body = input || {}
  if (Array.isArray(body.items)) {
    rows.push(
      ...body.items
        .filter(isPlainObject)
        .map((item) => ({ item, source: 'items' as const })),
    )
  }

  const parserBlockers: BulkBlocker[] = []

  if (typeof body.jsonText === 'string' && body.jsonText.trim()) {
    try {
      rows.push(
        ...parseJsonText(body.jsonText).map((entry) => ({
          ...entry,
          source: 'jsonText' as const,
        })),
      )
    } catch (err) {
      parserBlockers.push({
        code: 'invalid-json-bulk-input',
        message: (err as Error)?.message || 'Invalid JSON input',
        severity: 'error',
      })
    }
  }

  if (typeof body.csvText === 'string' && body.csvText.trim()) {
    try {
      rows.push(
        ...parseCsvText(body.csvText).map((entry) => ({
          ...entry,
          source: 'csvText' as const,
        })),
      )
    } catch (err) {
      parserBlockers.push({
        code: 'invalid-csv-bulk-input',
        message: (err as Error)?.message || 'Invalid CSV input',
        severity: 'error',
      })
    }
  }

  const normalized = normalizeItems(rows)
  normalized.blockers.push(...parserBlockers)
  if (!rows.length) {
    normalized.blockers.push({
      code: 'empty-bulk-input',
      message:
        'Provide CSV, JSON, or items to review before applying bulk mapping changes.',
      severity: 'error',
    })
  }

  return normalized
}

const addDuplicateTargetBlockers = (
  items: NormalizedBulkItem[],
  blockers: BulkBlocker[],
) => {
  const seenEntity = new Map<string, NormalizedBulkItem>()
  const seenPumpFp = new Map<string, NormalizedBulkItem>()
  const seenTank = new Map<string, NormalizedBulkItem>()
  const seenNozzleGradeOption = new Map<string, NormalizedBulkItem>()

  for (const item of items) {
    const entityKey = `${item.entityType}:${item.entityId}`
    const firstEntity = seenEntity.get(entityKey)
    if (firstEntity) {
      blockers.push({
        code: 'duplicate-entity-in-batch',
        message: `The batch contains multiple rows for ${entityKey}. Split them into separate reviewed batches.`,
        itemIndex: item.index,
        sourceLine: item.sourceLine,
        severity: 'error',
      })
    } else {
      seenEntity.set(entityKey, item)
    }

    if (item.entityType === 'pump') {
      const fp = String(item.mapping.domsFpId ?? '').trim()
      if (!fp) continue
      const first = seenPumpFp.get(fp)
      if (first) {
        blockers.push({
          code: 'duplicate-doms-fp-in-batch',
          message: `DOMS FpId ${fp} is assigned more than once in this batch.`,
          itemIndex: item.index,
          sourceLine: item.sourceLine,
          severity: 'error',
        })
      } else {
        seenPumpFp.set(fp, item)
      }
    }

    if (item.entityType === 'tank') {
      const tankId = String(item.mapping.domsTankId ?? '').trim()
      if (!tankId) continue
      const first = seenTank.get(tankId)
      if (first) {
        blockers.push({
          code: 'duplicate-doms-tank-in-batch',
          message: `DOMS TankId ${tankId} is assigned more than once in this batch.`,
          itemIndex: item.index,
          sourceLine: item.sourceLine,
          severity: 'error',
        })
      } else {
        seenTank.set(tankId, item)
      }
    }

    if (item.entityType === 'nozzle') {
      const gradeOption = String(item.mapping.domsGradeOptionId ?? '').trim()
      if (!gradeOption) continue
      const key = `${item.entityId}:${gradeOption}`
      const first = seenNozzleGradeOption.get(key)
      if (first) {
        blockers.push({
          code: 'duplicate-nozzle-grade-option-in-batch',
          message: `The same nozzle/grade-option target appears more than once in this batch.`,
          itemIndex: item.index,
          sourceLine: item.sourceLine,
          severity: 'error',
        })
      } else {
        seenNozzleGradeOption.set(key, item)
      }
    }
  }
}

const normalizeObserved = (values: unknown[]) =>
  new Set(values.map((value) => String(value ?? '').trim()).filter(Boolean))

const addLivePreValidationBlockers = (
  items: NormalizedBulkItem[],
  reconciliation: any,
  blockers: BulkBlocker[],
  warnings: BulkBlocker[],
) => {
  const observedFpIds = normalizeObserved(
    reconciliation?.summary?.observedDomsFpIds ?? [],
  )
  const observedTankIds = normalizeObserved(
    reconciliation?.summary?.observedDomsTankIds ?? [],
  )
  const observedTgIds = normalizeObserved(
    reconciliation?.summary?.observedDomsTgIds ?? [],
  )
  const hasLiveSnapshot =
    observedFpIds.size > 0 || observedTankIds.size > 0 || observedTgIds.size > 0

  if (!hasLiveSnapshot) {
    blockers.push({
      code: 'no-live-doms-snapshot',
      message:
        'No recent DOMS/PSS snapshot is available. Refresh reconciliation from the live controller before bulk applying mapping changes.',
      severity: 'error',
    })
    return
  }

  const unresolvedBlockingIssues =
    reconciliation?.remediation?.unresolvedBlockingIssues ?? []
  if (
    Array.isArray(unresolvedBlockingIssues) &&
    unresolvedBlockingIssues.length
  ) {
    blockers.push({
      code: 'reconciliation-has-blocking-issues',
      message: `Reconciliation has blocking issues: ${unresolvedBlockingIssues.join(', ')}`,
      severity: 'error',
    })
  }

  for (const item of items) {
    if (item.entityType === 'pump') {
      const fpId = String(item.mapping.domsFpId ?? '').trim()
      if (fpId && !observedFpIds.has(fpId)) {
        blockers.push({
          code: 'bulk-pump-fp-not-observed',
          message: `DOMS FpId ${fpId} has not been observed in the latest DOMS/PSS snapshot.`,
          itemIndex: item.index,
          sourceLine: item.sourceLine,
          severity: 'error',
        })
      }
    }

    const domsTankId = String(item.mapping.domsTankId ?? '').trim()
    if (
      domsTankId &&
      !observedTankIds.has(domsTankId) &&
      !observedTgIds.has(domsTankId)
    ) {
      warnings.push({
        code: 'bulk-tank-id-not-observed',
        message: `DOMS TankId ${domsTankId} was not observed in recent tank payloads. This may be normal if wetstock has not reported yet, but field confirmation is required.`,
        itemIndex: item.index,
        sourceLine: item.sourceLine,
        severity: 'warning',
      })
    }
  }
}

const addExistingMappingConflictBlockers = async (
  stationId: string,
  items: NormalizedBulkItem[],
  blockers: BulkBlocker[],
) => {
  for (const item of items) {
    if (item.entityType === 'pump') {
      const domsFpId = Number(String(item.mapping.domsFpId ?? '').trim())
      if (!Number.isFinite(domsFpId)) continue
      const duplicate = await getPumpByDomsFpId({
        stationId,
        domsFpId: Math.trunc(domsFpId),
        excludePumpId: item.entityId,
      })
      if (duplicate) {
        blockers.push({
          code: 'bulk-doms-fp-already-assigned',
          message: `DOMS FpId ${domsFpId} is already assigned to pump ${duplicate.pump_number}.`,
          itemIndex: item.index,
          sourceLine: item.sourceLine,
          severity: 'error',
        })
      }
    }

    if (item.entityType === 'tank') {
      const domsTankId = String(item.mapping.domsTankId ?? '').trim()
      if (!domsTankId) continue
      const duplicate = await getTankByDomsTankId({
        stationId,
        domsTankId,
        excludeTankId: item.entityId,
      })
      if (duplicate) {
        blockers.push({
          code: 'bulk-doms-tank-already-assigned',
          message: `DOMS TankId ${domsTankId} is already assigned to tank ${duplicate.code ?? duplicate.name ?? duplicate.id}.`,
          itemIndex: item.index,
          sourceLine: item.sourceLine,
          severity: 'error',
        })
      }
    }

    if (item.entityType === 'nozzle') {
      const domsGradeOptionId = Number(
        String(item.mapping.domsGradeOptionId ?? '').trim(),
      )
      if (!Number.isFinite(domsGradeOptionId)) continue

      const nozzle = await getNozzleMappingRow({
        stationId,
        nozzleId: item.entityId,
      })
      if (!nozzle) {
        blockers.push({
          code: 'bulk-nozzle-not-found',
          message: `Nozzle ${item.entityId} was not found for this station.`,
          itemIndex: item.index,
          sourceLine: item.sourceLine,
          severity: 'error',
        })
        continue
      }

      const duplicate = await getNozzleByPumpGradeOption({
        stationId,
        pumpId: nozzle.pump_id,
        domsGradeOptionId: Math.trunc(domsGradeOptionId),
        excludeNozzleId: item.entityId,
      })
      if (duplicate) {
        blockers.push({
          code: 'bulk-nozzle-grade-option-already-assigned',
          message: `DOMS grade option ${domsGradeOptionId} is already assigned to nozzle ${duplicate.nozzle_number} on this pump.`,
          itemIndex: item.index,
          sourceLine: item.sourceLine,
          severity: 'error',
        })
      }
    }
  }
}

export async function reviewBulkDomsMappingRemediation(
  input: BulkDomsMappingRemediationInput | null | undefined,
  user: SessionUser,
) {
  requireNonEmptyString(user.stationId, 'stationId')
  const parsed = parseBulkDomsMappingInput(input)
  const blockers = [...parsed.blockers]
  const warnings: BulkBlocker[] = []
  const reconciliation = await getDomsConfigurationReconciliation(
    user.stationId,
  )

  addDuplicateTargetBlockers(parsed.items, blockers)
  await addExistingMappingConflictBlockers(
    user.stationId,
    parsed.items,
    blockers,
  )
  addLivePreValidationBlockers(parsed.items, reconciliation, blockers, warnings)

  return {
    ok: blockers.length === 0,
    mode: parseMode(input?.mode),
    generatedAt: new Date().toISOString(),
    summary: {
      itemCount: parsed.items.length,
      blockerCount: blockers.length,
      warningCount: warnings.length,
      observedDomsFpIdCount:
        reconciliation?.summary?.observedDomsFpIds?.length ?? 0,
      observedDomsTankIdCount:
        reconciliation?.summary?.observedDomsTankIds?.length ?? 0,
      observedDomsTgIdCount:
        reconciliation?.summary?.observedDomsTgIds?.length ?? 0,
    },
    blockers,
    warnings,
    items: parsed.items,
    safetyNotice:
      'Bulk remediation updates FTC-side mapping fields only. No DOMS/PSS install, clear-install, or write command is sent.',
    reconciliation: {
      severity: reconciliation?.severity ?? 'unknown',
      generatedAt: reconciliation?.generatedAt ?? null,
      summary: reconciliation?.summary ?? null,
      unresolvedBlockingIssues:
        reconciliation?.remediation?.unresolvedBlockingIssues ?? [],
    },
  }
}

const toApplyInput = (
  item: NormalizedBulkItem,
  confirmationNote: string | null,
): ApplyDomsMappingRemediationInput => ({
  entityType: item.entityType,
  entityId: item.entityId,
  mapping: item.mapping,
  confirmPhysicalMapping: true,
  confirmationNote: [confirmationNote, item.note]
    .filter((part) => typeof part === 'string' && part.trim())
    .join('\n')
    .slice(0, 500),
  sourceSuggestionCode: item.sourceSuggestionCode ?? 'bulk-import',
})

export async function applyBulkDomsMappingRemediation(
  input: BulkDomsMappingRemediationInput | null | undefined,
  user: SessionUser,
) {
  const mode = parseMode(input?.mode)
  const review = await reviewBulkDomsMappingRemediation(input, user)

  if (mode !== 'apply') return { ...review, applied: [] }

  if (input?.confirmPhysicalMapping !== true) {
    throw new Error(
      'confirmPhysicalMapping must be true after checking every mapping against the physical site and PSS Configurator.',
    )
  }
  if (input?.confirmLivePreValidation !== true) {
    throw new Error(
      'confirmLivePreValidation must be true after refreshing reconciliation from live DOMS/PSS data.',
    )
  }
  if (input?.confirmBulkApply !== true) {
    throw new Error('confirmBulkApply must be true to apply a reviewed batch.')
  }
  if (!review.ok) {
    throw new Error(
      'Bulk mapping remediation has blockers and cannot be applied.',
    )
  }

  const confirmationNote = optionalText(input?.confirmationNote, 500)
  const applied = []
  for (const item of review.items) {
    const result = await applyDomsMappingRemediation(
      toApplyInput(item, confirmationNote),
      user,
    )
    applied.push({ item, result })
  }

  await createAuditLog({
    stationId: user.stationId,
    userId: user.id,
    action: 'DOMS_MAPPING_BULK_APPLIED',
    entityType: 'forecourt.mapping-bulk',
    entityId: user.stationId,
    newValues: { appliedCount: applied.length },
    metadata: {
      source: 'doms-reconciliation-bulk-remediation',
      itemCount: review.items.length,
      confirmationNote,
      safetyBoundary:
        'FTC-side mapping batch update only. No DOMS/JPL install or clear-install command was sent.',
    },
  })

  await recordForecourtEvent({
    stationId: user.stationId,
    source: 'admin',
    eventType: 'doms.mapping_bulk_applied',
    payload: {
      userId: user.id,
      username: user.username,
      appliedCount: applied.length,
      itemCount: review.items.length,
      confirmationNote,
      safetyBoundary:
        'FTC-side mapping batch update only. No DOMS/JPL install or clear-install command was sent.',
    },
  })

  const reconciliation = await getDomsConfigurationReconciliation(
    user.stationId,
  )
  return {
    ...review,
    applied,
    reconciliationAfterApply: reconciliation,
  }
}

export const buildBulkDomsMappingCsvTemplate = () =>
  `${CSV_HEADERS.join(',')}\npump,00000000-0000-0000-0000-000000000000,1,,,,field-confirmed,Checked dispenser 1 against PSS Configurator\ntank,00000000-0000-0000-0000-000000000000,,1,,,,Checked tank gauge 1\nnozzle,00000000-0000-0000-0000-000000000000,,1,1,1,,Checked pump/nozzle grade and tank mapping\n`
