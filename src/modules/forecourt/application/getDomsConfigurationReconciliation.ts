import { requireNonEmptyString } from '@/src/shared/utils/inputs'

import type {
  ReconciliationEventRow,
  ReconciliationForecourtStateRow,
  ReconciliationNozzleRow,
  ReconciliationPumpRow,
  ReconciliationTankRow,
} from '../infrastructure/reconciliationRepo'
import {
  getLatestFcInstallStatusForReconciliation,
  listConfiguredNozzlesForReconciliation,
  listConfiguredPumpsForReconciliation,
  listConfiguredTanksForReconciliation,
  listForecourtStatesForReconciliation,
  listRecentJplEventsForReconciliation,
} from '../infrastructure/reconciliationRepo'

type ReconciliationSeverity = 'ok' | 'info' | 'warning' | 'error'

type ReconciliationIssue = {
  severity: Exclude<ReconciliationSeverity, 'ok'>
  code: string
  message: string
  entityType: 'site' | 'pump' | 'nozzle' | 'tank' | 'doms'
  entityId?: string | number | null
  details?: Record<string, unknown>
}

type ReconciliationSuggestion = {
  severity: Exclude<ReconciliationSeverity, 'ok'>
  code: string
  title: string
  description: string
  entityType: 'site' | 'pump' | 'nozzle' | 'tank' | 'doms'
  entityId?: string | number | null
  confidence: 'high' | 'medium' | 'low'
  suggestedAction: string
  suggestedValue?: Record<string, unknown>
  blockedBy?: string[]
  relatedIssueCodes?: string[]
}

const severityScore: Record<ReconciliationSeverity, number> = {
  ok: 0,
  info: 1,
  warning: 2,
  error: 3,
}

const normalizeDomsId = (value: unknown) => {
  const text = String(value ?? '').trim()
  if (!text) return null
  const numeric = Number.parseInt(text, 10)
  if (Number.isFinite(numeric) && numeric >= 0) return String(numeric)
  return text
}

const addIssue = (
  issues: ReconciliationIssue[],
  issue: ReconciliationIssue,
) => {
  issues.push(issue)
}

const addSuggestion = (
  suggestions: ReconciliationSuggestion[],
  suggestion: ReconciliationSuggestion,
) => {
  suggestions.push(suggestion)
}

const uniqueSuggestions = (suggestions: ReconciliationSuggestion[]) => {
  const seen = new Set<string>()
  return suggestions.filter((suggestion) => {
    const key = [
      suggestion.code,
      suggestion.entityType,
      suggestion.entityId ?? '',
      JSON.stringify(suggestion.suggestedValue ?? {}),
    ].join(':')
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

const countIssuesByEntity = (issues: ReconciliationIssue[]) => {
  return issues.reduce(
    (acc, issue) => {
      acc[issue.entityType] = (acc[issue.entityType] ?? 0) + 1
      return acc
    },
    {} as Record<ReconciliationIssue['entityType'], number>,
  )
}

const maxSeverity = (issues: ReconciliationIssue[]): ReconciliationSeverity => {
  let result: ReconciliationSeverity = 'ok'
  for (const issue of issues) {
    if (severityScore[issue.severity] > severityScore[result]) {
      result = issue.severity
    }
  }
  return result
}

const toArray = (value: unknown): any[] => (Array.isArray(value) ? value : [])

const collectValuesForKeys = (
  value: unknown,
  keys: Set<string>,
  output: Set<string>,
  depth = 0,
) => {
  if (depth > 8 || value == null) return
  if (Array.isArray(value)) {
    for (const item of value)
      collectValuesForKeys(item, keys, output, depth + 1)
    return
  }
  if (typeof value !== 'object') return

  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (keys.has(key)) {
      const normalized = normalizeDomsId((raw as any)?.value ?? raw)
      if (normalized) output.add(normalized)
    }
    collectValuesForKeys(raw, keys, output, depth + 1)
  }
}

const extractInstallGroups = (event: ReconciliationEventRow | null) => {
  const payload = event?.payload ?? {}
  return toArray(payload?.InstalledFcDeviceGroups).map((group) => {
    const rawCode =
      group?.ExtendedInstallMsgCode ??
      group?.InstallMsgCode ??
      group?.code ??
      null
    const deviceIds = toArray(group?.FcDeviceId)
      .map((id) => normalizeDomsId((id as any)?.value ?? id))
      .filter(Boolean)

    return {
      code: rawCode != null ? String(rawCode) : null,
      deviceIds,
      raw: group,
    }
  })
}

const extractInstalledEquipment = (event: ReconciliationEventRow | null) => {
  const payload = event?.payload ?? {}
  return toArray(payload?.InstalledFcEquipmentTypes).map((group) => {
    const type =
      group?.FcEquipmentType?.value ??
      group?.FcEquipmentType?.enum ??
      group?.FcEquipmentType ??
      null
    const equipmentIds = toArray(group?.FcEquipmentId)
      .map((id) => normalizeDomsId((id as any)?.value ?? id))
      .filter(Boolean)

    return {
      type: type != null ? String(type) : null,
      equipmentIds,
      raw: group,
    }
  })
}

const extractObservedFpIds = (
  states: ReconciliationForecourtStateRow[],
  events: ReconciliationEventRow[],
) => {
  const ids = new Set<string>()
  for (const state of states) {
    const normalized = normalizeDomsId(state.fp_id)
    if (normalized) ids.add(normalized)
  }
  for (const event of events) {
    const normalized = normalizeDomsId(
      event.payload?.FpId ?? event.payload?.fpId ?? event.payload?.pumpId,
    )
    if (normalized) ids.add(normalized)
  }
  return ids
}

const extractObservedTgIds = (events: ReconciliationEventRow[]) => {
  const ids = new Set<string>()
  for (const event of events) {
    const normalized = normalizeDomsId(
      event.payload?.TgId ?? event.payload?.tgId ?? event.payload?.TgID,
    )
    if (normalized) ids.add(normalized)
  }
  return ids
}

const extractObservedTankIds = (events: ReconciliationEventRow[]) => {
  const ids = new Set<string>()
  for (const event of events) {
    collectValuesForKeys(
      event.payload,
      new Set(['TankId', 'FcTankId', 'tankId']),
      ids,
    )
  }
  return ids
}

const pumpDomsId = (pump: ReconciliationPumpRow) =>
  normalizeDomsId(pump.doms_fp_id ?? pump.pump_number)

const tankDomsId = (tank: ReconciliationTankRow) =>
  normalizeDomsId(tank.doms_tank_id ?? tank.code)

const nozzleDomsTankId = (nozzle: ReconciliationNozzleRow) =>
  normalizeDomsId(nozzle.doms_tank_id)

const nozzleDomsGradeId = (nozzle: ReconciliationNozzleRow) =>
  normalizeDomsId(nozzle.doms_grade_id)

const nozzleDomsGradeOptionId = (nozzle: ReconciliationNozzleRow) =>
  normalizeDomsId(nozzle.doms_grade_option_id ?? nozzle.nozzle_number)

const findSingleUnobservedPumpCandidate = <T extends { observed?: boolean }>(
  pumps: T[],
) => {
  const candidates = pumps.filter((pump) => !pump.observed)
  return candidates.length === 1 ? candidates[0] : null
}

const findSingleUnmappedTankCandidate = (tanks: ReconciliationTankRow[]) => {
  const candidates = tanks.filter((tank) => !tank.doms_tank_id)
  return candidates.length === 1 ? candidates[0] : null
}

const buildPumpRows = (
  pumps: ReconciliationPumpRow[],
  states: ReconciliationForecourtStateRow[],
) => {
  const stateByFpId = new Map(
    states.map((state) => [normalizeDomsId(state.fp_id), state]),
  )

  return pumps.map((pump) => {
    const domsFpId = pumpDomsId(pump)
    const state = domsFpId ? stateByFpId.get(domsFpId) : null
    return {
      ...pump,
      domsFpId,
      observed: Boolean(state),
      latestStatus: state?.status ?? null,
      latestEventType: state?.last_event_type ?? null,
      latestSeenAt: state?.updated_at ?? pump.doms_last_seen_at ?? null,
      latestPayload: state?.data ?? null,
    }
  })
}

export async function getDomsConfigurationReconciliation(stationId: string) {
  const normalizedStationId = requireNonEmptyString(stationId, 'stationId')
  const [pumps, nozzles, tanks, installStatus, states, recentEvents] =
    await Promise.all([
      listConfiguredPumpsForReconciliation(normalizedStationId),
      listConfiguredNozzlesForReconciliation(normalizedStationId),
      listConfiguredTanksForReconciliation(normalizedStationId),
      getLatestFcInstallStatusForReconciliation(normalizedStationId),
      listForecourtStatesForReconciliation(normalizedStationId),
      listRecentJplEventsForReconciliation({
        stationId: normalizedStationId,
        patterns: [
          'FpStatus_resp%',
          'TgStatus_resp%',
          'TankDeliveryData_resp%',
          'FcInstallStatus_resp%',
        ],
        limit: 120,
      }),
    ])

  const issues: ReconciliationIssue[] = []
  const suggestions: ReconciliationSuggestion[] = []
  const pumpRows = buildPumpRows(pumps, states)
  const installGroups = extractInstallGroups(installStatus)
  const installedEquipment = extractInstalledEquipment(installStatus)
  const observedFpIds = extractObservedFpIds(states, recentEvents)
  const observedTgIds = extractObservedTgIds(recentEvents)
  const observedTankIds = extractObservedTankIds(recentEvents)
  const configuredFpIds = new Set(
    pumps.map((pump) => pumpDomsId(pump)).filter(Boolean) as string[],
  )
  const configuredTankIds = new Set(
    tanks.map((tank) => tankDomsId(tank)).filter(Boolean) as string[],
  )

  if (!installStatus) {
    addIssue(issues, {
      severity: 'warning',
      code: 'missing-fc-install-status',
      message:
        'No FcInstallStatus snapshot has been persisted yet. Run a DOMS status refresh before reconciling installed controller devices.',
      entityType: 'site',
    })
    addSuggestion(suggestions, {
      severity: 'warning',
      code: 'collect-fc-install-status',
      title: 'Collect DOMS installation status',
      description:
        'Run a JPL installation/status refresh so the reconciliation can compare FTC mappings against controller-installed devices instead of runtime events only.',
      entityType: 'site',
      confidence: 'high',
      suggestedAction:
        'Use the Forecourt diagnostics controls to request FcInstallStatus, then refresh this reconciliation panel.',
      relatedIssueCodes: ['missing-fc-install-status'],
    })
  }

  for (const pump of pumpRows) {
    if (!pump.doms_fp_id) {
      addIssue(issues, {
        severity: 'warning',
        code: 'pump-missing-explicit-doms-fp-id',
        message: `Pump ${pump.pump_number} is using the pump number as a fallback DOMS FpId. Confirm this matches the PSS configuration.`,
        entityType: 'pump',
        entityId: pump.id,
        details: {
          pumpNumber: pump.pump_number,
          fallbackDomsFpId: pump.domsFpId,
        },
      })
      addSuggestion(suggestions, {
        severity: pump.observed ? 'info' : 'warning',
        code: 'set-explicit-pump-doms-fp-id',
        title: `Set explicit DOMS FpId for pump ${pump.pump_number}`,
        description: pump.observed
          ? `Pump ${pump.pump_number} is observed on DOMS FpId ${pump.domsFpId}. Store that value explicitly to avoid fallback mapping drift.`
          : `Pump ${pump.pump_number} is currently mapped by fallback pump number ${pump.domsFpId}. Confirm the PSS FpId before storing it explicitly.`,
        entityType: 'pump',
        entityId: pump.id,
        confidence: pump.observed ? 'high' : 'medium',
        suggestedAction:
          'Review the pump mapping in station setup and persist doms_fp_id once confirmed.',
        suggestedValue: {
          doms_fp_id: pump.domsFpId,
          pump_number: pump.pump_number,
        },
        relatedIssueCodes: ['pump-missing-explicit-doms-fp-id'],
      })
    }

    if (
      observedFpIds.size > 0 &&
      pump.domsFpId &&
      !observedFpIds.has(pump.domsFpId)
    ) {
      addIssue(issues, {
        severity: 'warning',
        code: 'configured-pump-not-observed',
        message: `Configured DOMS FpId ${pump.domsFpId} for pump ${pump.pump_number} was not observed in the latest JPL status snapshots.`,
        entityType: 'pump',
        entityId: pump.id,
        details: { pumpNumber: pump.pump_number, domsFpId: pump.domsFpId },
      })
    }
  }

  for (const observedFpId of observedFpIds) {
    if (!configuredFpIds.has(observedFpId)) {
      addIssue(issues, {
        severity: 'error',
        code: 'observed-fp-unmapped',
        message: `DOMS FpId ${observedFpId} was observed but is not mapped to an FTC pump.`,
        entityType: 'doms',
        entityId: observedFpId,
      })
      const candidatePump = findSingleUnobservedPumpCandidate(pumpRows)
      addSuggestion(suggestions, {
        severity: 'error',
        code: 'map-observed-doms-fp-id',
        title: `Map observed DOMS FpId ${observedFpId}`,
        description: candidatePump
          ? `DOMS FpId ${observedFpId} is active but unmapped. Pump ${candidatePump.pump_number} is the only configured pump not observed, so it is a possible candidate.`
          : `DOMS FpId ${observedFpId} is active but unmapped. Compare the physical dispenser number with the FTC pump list before assigning it.`,
        entityType: 'doms',
        entityId: observedFpId,
        confidence: candidatePump ? 'medium' : 'low',
        suggestedAction:
          'Review physical pump numbering and update the matching FTC pump doms_fp_id. Do not send install commands from FTC.',
        suggestedValue: candidatePump
          ? {
              pump_id: candidatePump.id,
              pump_number: candidatePump.pump_number,
              doms_fp_id: observedFpId,
            }
          : { doms_fp_id: observedFpId },
        relatedIssueCodes: ['observed-fp-unmapped'],
      })
    }
  }

  for (const nozzle of nozzles) {
    const gradeOptionId = nozzleDomsGradeOptionId(nozzle)
    const gradeId = nozzleDomsGradeId(nozzle)
    const linkedDomsTankId = nozzleDomsTankId(nozzle)

    if (!gradeOptionId) {
      addIssue(issues, {
        severity: 'warning',
        code: 'nozzle-missing-doms-grade-option',
        message: `Pump ${nozzle.pump_number} nozzle ${nozzle.nozzle_number} has no DOMS grade option mapping.`,
        entityType: 'nozzle',
        entityId: nozzle.id,
      })
      addSuggestion(suggestions, {
        severity: 'warning',
        code: 'set-nozzle-grade-option',
        title: `Set grade option for pump ${nozzle.pump_number} nozzle ${nozzle.nozzle_number}`,
        description:
          'The nozzle has no explicit DOMS grade-option mapping. In many PSS configurations this matches the nozzle number, but it must be checked against FpInstallData.',
        entityType: 'nozzle',
        entityId: nozzle.id,
        confidence: 'medium',
        suggestedAction:
          'Collect or review FpInstallData for the pump, then set doms_grade_option_id on the nozzle mapping.',
        suggestedValue: { doms_grade_option_id: nozzle.nozzle_number },
        relatedIssueCodes: ['nozzle-missing-doms-grade-option'],
      })
    }
    if (!gradeId) {
      addIssue(issues, {
        severity: 'warning',
        code: 'nozzle-missing-doms-grade-id',
        message: `Pump ${nozzle.pump_number} nozzle ${nozzle.nozzle_number} has no DOMS grade ID.`,
        entityType: 'nozzle',
        entityId: nozzle.id,
      })
      addSuggestion(suggestions, {
        severity: 'warning',
        code: 'set-nozzle-grade-id',
        title: `Set DOMS grade ID for pump ${nozzle.pump_number} nozzle ${nozzle.nozzle_number}`,
        description:
          'The nozzle cannot be confidently tied to controller grades or price-bank rows until doms_grade_id is stored.',
        entityType: 'nozzle',
        entityId: nozzle.id,
        confidence: 'low',
        suggestedAction:
          'Use FpInstallData and the active DOMS price bank to confirm the grade ID before updating the nozzle mapping.',
        suggestedValue: {
          product_code: nozzle.product_code,
          product_name: nozzle.product_name,
        },
        relatedIssueCodes: ['nozzle-missing-doms-grade-id'],
      })
    }
    if (!linkedDomsTankId) {
      addIssue(issues, {
        severity: 'warning',
        code: 'nozzle-missing-doms-tank-id',
        message: `Pump ${nozzle.pump_number} nozzle ${nozzle.nozzle_number} has no DOMS tank ID.`,
        entityType: 'nozzle',
        entityId: nozzle.id,
      })
      addSuggestion(suggestions, {
        severity: 'warning',
        code: 'set-nozzle-doms-tank-id',
        title: `Set DOMS tank ID for pump ${nozzle.pump_number} nozzle ${nozzle.nozzle_number}`,
        description:
          'The nozzle has no controller tank mapping, so wetstock reconciliation cannot validate the tank connection for this grade option.',
        entityType: 'nozzle',
        entityId: nozzle.id,
        confidence: 'low',
        suggestedAction:
          'Confirm the tank connection from FpInstallData or PSS Configurator and update doms_tank_id on the nozzle.',
        suggestedValue: {
          tank_id: nozzle.tank_id,
          tank_code: nozzle.tank_code,
        },
        relatedIssueCodes: ['nozzle-missing-doms-tank-id'],
      })
    } else if (!configuredTankIds.has(linkedDomsTankId)) {
      addIssue(issues, {
        severity: 'warning',
        code: 'nozzle-doms-tank-not-configured',
        message: `Pump ${nozzle.pump_number} nozzle ${nozzle.nozzle_number} points to DOMS tank ${linkedDomsTankId}, but no FTC tank has that DOMS TankId.`,
        entityType: 'nozzle',
        entityId: nozzle.id,
        details: { linkedDomsTankId },
      })
      addSuggestion(suggestions, {
        severity: 'warning',
        code: 'align-nozzle-and-tank-mapping',
        title: `Align DOMS tank ${linkedDomsTankId} with FTC tanks`,
        description:
          'A nozzle references a DOMS tank ID that is not configured on any FTC tank. This can cause wetstock reports and fuel sales to disagree.',
        entityType: 'nozzle',
        entityId: nozzle.id,
        confidence: 'medium',
        suggestedAction:
          'Update the correct FTC tank doms_tank_id, or correct the nozzle doms_tank_id if it points to the wrong controller tank.',
        suggestedValue: { linkedDomsTankId },
        relatedIssueCodes: ['nozzle-doms-tank-not-configured'],
      })
    }
  }

  for (const tank of tanks) {
    const domsTankId = tankDomsId(tank)
    if (!tank.doms_tank_id) {
      addIssue(issues, {
        severity: 'warning',
        code: 'tank-missing-explicit-doms-tank-id',
        message: `Tank ${tank.code} is using its FTC code as a fallback DOMS TankId. Confirm this matches the PSS tank gauge configuration.`,
        entityType: 'tank',
        entityId: tank.id,
        details: { tankCode: tank.code, fallbackDomsTankId: domsTankId },
      })
      addSuggestion(suggestions, {
        severity: observedTankIds.has(String(domsTankId)) ? 'info' : 'warning',
        code: 'set-explicit-tank-doms-id',
        title: `Set explicit DOMS TankId for tank ${tank.code}`,
        description: observedTankIds.has(String(domsTankId))
          ? `Tank ${tank.code} is observed in wetstock payloads as DOMS TankId ${domsTankId}. Store that value explicitly to avoid fallback drift.`
          : `Tank ${tank.code} is using its FTC code as a fallback DOMS TankId. Confirm the PSS tank ID before storing it explicitly.`,
        entityType: 'tank',
        entityId: tank.id,
        confidence: observedTankIds.has(String(domsTankId)) ? 'high' : 'medium',
        suggestedAction:
          'Review tank setup and persist doms_tank_id after confirmation.',
        suggestedValue: { doms_tank_id: domsTankId, tank_code: tank.code },
        relatedIssueCodes: ['tank-missing-explicit-doms-tank-id'],
      })
    }
  }

  for (const observedTankId of observedTankIds) {
    if (!configuredTankIds.has(observedTankId)) {
      addIssue(issues, {
        severity: 'warning',
        code: 'observed-tank-unmapped',
        message: `DOMS TankId ${observedTankId} was observed in recent wetstock payloads but is not mapped to an FTC tank.`,
        entityType: 'doms',
        entityId: observedTankId,
      })
      const candidateTank = findSingleUnmappedTankCandidate(tanks)
      addSuggestion(suggestions, {
        severity: 'warning',
        code: 'map-observed-doms-tank-id',
        title: `Map observed DOMS TankId ${observedTankId}`,
        description: candidateTank
          ? `DOMS TankId ${observedTankId} is visible in wetstock data and ${candidateTank.code} is the only tank without an explicit DOMS TankId.`
          : `DOMS TankId ${observedTankId} is visible in wetstock data but is not mapped to an FTC tank.`,
        entityType: 'doms',
        entityId: observedTankId,
        confidence: candidateTank ? 'medium' : 'low',
        suggestedAction:
          'Confirm the physical tank and update the matching FTC tank doms_tank_id. Do not modify PSS configuration from FTC.',
        suggestedValue: candidateTank
          ? {
              tank_id: candidateTank.id,
              tank_code: candidateTank.code,
              doms_tank_id: observedTankId,
            }
          : { doms_tank_id: observedTankId },
        relatedIssueCodes: ['observed-tank-unmapped'],
      })
    }
  }

  const issueCounts = issues.reduce(
    (acc, issue) => {
      acc[issue.severity] += 1
      return acc
    },
    { info: 0, warning: 0, error: 0 } as Record<
      Exclude<ReconciliationSeverity, 'ok'>,
      number
    >,
  )
  const issueEntityCounts = countIssuesByEntity(issues)
  const remediationSuggestions = uniqueSuggestions(suggestions)
  const unresolvedBlockingIssues = issues
    .filter((issue) => issue.severity === 'error')
    .map((issue) => issue.code)

  return {
    ok: true,
    stationId: normalizedStationId,
    severity: maxSeverity(issues),
    issueCounts,
    issueEntityCounts,
    generatedAt: new Date().toISOString(),
    summary: {
      configuredPumps: pumps.length,
      configuredNozzles: nozzles.length,
      configuredTanks: tanks.length,
      observedDomsFpIds: Array.from(observedFpIds).sort(),
      observedDomsTgIds: Array.from(observedTgIds).sort(),
      observedDomsTankIds: Array.from(observedTankIds).sort(),
      installStatusSeenAt: installStatus?.occurred_at ?? null,
      latestRuntimeStateCount: states.length,
      remediationSuggestionCount: remediationSuggestions.length,
      unresolvedBlockingIssueCount: unresolvedBlockingIssues.length,
    },
    issues,
    remediation: {
      suggestions: remediationSuggestions,
      unresolvedBlockingIssues,
      safetyNotice:
        'Suggestions are read-only and must be confirmed against the physical site and PSS Configurator before mappings are changed.',
    },
    doms: {
      latestInstallStatus: installStatus,
      installGroups,
      installedEquipment,
      recentEvents: recentEvents.slice(0, 20),
    },
    ftc: {
      pumps: pumpRows,
      nozzles: nozzles.map((nozzle) => ({
        ...nozzle,
        domsFpId: normalizeDomsId(nozzle.doms_fp_id ?? nozzle.pump_number),
        domsGradeOptionId: nozzleDomsGradeOptionId(nozzle),
        domsGradeId: nozzleDomsGradeId(nozzle),
        domsTankId: nozzleDomsTankId(nozzle),
      })),
      tanks: tanks.map((tank) => ({ ...tank, domsTankId: tankDomsId(tank) })),
    },
  }
}
