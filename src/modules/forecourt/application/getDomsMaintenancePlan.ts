import { getDomsConfigurationReconciliation } from './getDomsConfigurationReconciliation'

type MaintenanceStepSeverity = 'info' | 'warning' | 'error'
type MaintenanceStepCategory =
  | 'snapshot'
  | 'mapping-review'
  | 'ftc-remediation'
  | 'pss-maintenance-candidate'
  | 'verification'

type MaintenanceStep = {
  id: string
  category: MaintenanceStepCategory
  severity: MaintenanceStepSeverity
  title: string
  description: string
  suggestedAction: string
  entityType?: string | null
  entityId?: string | number | null
  relatedIssueCodes?: string[]
  relatedSuggestionCode?: string | null
  dryRunOnly: true
  sendsDomsCommand: false
  plannedJplCommandName?: string | null
  plannedJplSubCode?: string | null
  safetyNote: string
}

const MAX_STEPS_PER_GROUP = 20

const trimDashEdges = (value: string) => {
  let result = value
  while (result.startsWith('-')) result = result.slice(1)
  while (result.endsWith('-')) result = result.slice(0, -1)
  return result
}

const compactDashes = (value: string) => {
  let result = value
  while (result.includes('--')) result = result.replaceAll('--', '-')
  return result
}

const slug = (value: unknown) => {
  const safe = String(value ?? '')
    .trim()
    .toLowerCase()
    .split('')
    .map((char) => {
      const code = char.charCodeAt(0)
      const isNumber = code >= 48 && code <= 57
      const isAlpha = code >= 97 && code <= 122
      return isNumber || isAlpha ? char : '-'
    })
    .join('')
  return trimDashEdges(compactDashes(safe)).slice(0, 80) || 'step'
}

const countBy = <T>(items: T[], getKey: (item: T) => string) => {
  return items.reduce(
    (acc, item) => {
      const key = getKey(item)
      acc[key] = (acc[key] ?? 0) + 1
      return acc
    },
    {} as Record<string, number>,
  )
}

const hasIssue = (issues: any[], code: string) =>
  issues.some((issue) => issue?.code === code)

const buildSnapshotSteps = (reconciliation: any): MaintenanceStep[] => {
  const steps: MaintenanceStep[] = []
  const issues = reconciliation?.issues ?? []

  if (hasIssue(issues, 'missing-fc-install-status')) {
    steps.push({
      id: 'collect-fc-install-status',
      category: 'snapshot',
      severity: 'warning',
      title: 'Collect DOMS installation status before maintenance',
      description:
        'The reconciliation does not have an FcInstallStatus snapshot. Maintenance planning should not rely only on runtime events.',
      suggestedAction:
        'Use the Forecourt diagnostics/operations controls to collect FcInstallStatus, FpStatus, TgStatus, and TankDeliveryData snapshots, then refresh this plan.',
      relatedIssueCodes: ['missing-fc-install-status'],
      dryRunOnly: true,
      sendsDomsCommand: false,
      plannedJplCommandName: 'FcInstallStatus_req',
      plannedJplSubCode: '02H',
      safetyNote:
        'This plan does not send the request automatically; it only identifies the read-only snapshot needed before a maintenance window.',
    })
  }

  if (!reconciliation?.summary?.latestRuntimeStateCount) {
    steps.push({
      id: 'collect-runtime-status',
      category: 'snapshot',
      severity: 'info',
      title: 'Refresh runtime pump and tank status',
      description:
        'A recent runtime status snapshot helps confirm whether FTC mappings match the live controller device IDs.',
      suggestedAction:
        'Collect FpStatus and TgStatus from DOMS/JPL before any FTC-side mapping or PSS maintenance review.',
      relatedIssueCodes: [],
      dryRunOnly: true,
      sendsDomsCommand: false,
      plannedJplCommandName: 'FpStatus_req / TgStatus_req',
      plannedJplSubCode: '00H',
      safetyNote:
        'Status requests are operational reads. This plan still does not send them or change controller configuration.',
    })
  }

  return steps
}

const buildSuggestionSteps = (reconciliation: any): MaintenanceStep[] => {
  const suggestions = reconciliation?.remediation?.suggestions ?? []
  return suggestions
    .slice(0, MAX_STEPS_PER_GROUP)
    .map((suggestion: any, index: number) => {
      const code = String(suggestion?.code ?? `suggestion-${index}`)
      const category: MaintenanceStepCategory =
        suggestion?.suggestedValue && suggestion?.entityType !== 'site'
          ? 'ftc-remediation'
          : 'mapping-review'

      return {
        id: `review-${slug(code)}-${index + 1}`,
        category,
        severity: String(
          suggestion?.severity ?? 'info',
        ) as MaintenanceStepSeverity,
        title: String(suggestion?.title ?? 'Review reconciliation suggestion'),
        description: String(suggestion?.description ?? ''),
        suggestedAction: String(
          suggestion?.suggestedAction ?? 'Review this item.',
        ),
        entityType: suggestion?.entityType ?? null,
        entityId: suggestion?.entityId ?? null,
        relatedIssueCodes: Array.isArray(suggestion?.relatedIssueCodes)
          ? suggestion.relatedIssueCodes
          : [],
        relatedSuggestionCode: code,
        dryRunOnly: true,
        sendsDomsCommand: false,
        plannedJplCommandName: null,
        plannedJplSubCode: null,
        safetyNote:
          'This is an FTC-side review/remediation step. It does not install, clear, or modify anything in DOMS/PSS.',
      }
    })
}

const buildPssCandidateSteps = (reconciliation: any): MaintenanceStep[] => {
  const issues = reconciliation?.issues ?? []
  const candidates: MaintenanceStep[] = []
  const pssCandidateCodes = new Set([
    'observed-fp-unmapped',
    'observed-tank-unmapped',
    'nozzle-doms-tank-not-configured',
  ])

  for (const issue of issues) {
    if (!pssCandidateCodes.has(String(issue?.code ?? ''))) continue
    candidates.push({
      id: `pss-review-${slug(issue.code)}-${slug(issue.entityId)}-${candidates.length + 1}`,
      category: 'pss-maintenance-candidate',
      severity: String(issue?.severity ?? 'warning') as MaintenanceStepSeverity,
      title: `Review possible PSS configuration mismatch: ${issue.code}`,
      description: String(issue?.message ?? ''),
      suggestedAction:
        'Check the physical site and PSS Configurator. If the controller configuration is wrong, schedule a supervised PSS maintenance window outside FTC before adding any FTC write automation.',
      entityType: issue?.entityType ?? null,
      entityId: issue?.entityId ?? null,
      relatedIssueCodes: [String(issue?.code ?? '')],
      relatedSuggestionCode: null,
      dryRunOnly: true,
      sendsDomsCommand: false,
      plannedJplCommandName: 'install_* / clear_InstallData candidate only',
      plannedJplSubCode: null,
      safetyNote:
        'No install or clear-install command is generated or sent. This step only flags that PSS Configurator may need manual review.',
    })
  }

  return candidates.slice(0, MAX_STEPS_PER_GROUP)
}

const buildVerificationSteps = (reconciliation: any): MaintenanceStep[] => {
  const hasIssues = (reconciliation?.issues ?? []).length > 0
  return [
    {
      id: 'post-review-refresh',
      category: 'verification',
      severity: hasIssues ? 'warning' : 'info',
      title: 'Refresh reconciliation after every accepted mapping change',
      description:
        'After FTC-side mapping changes or manual PSS Configurator changes, refresh DOMS/JPL snapshots and run reconciliation again.',
      suggestedAction:
        'Collect updated FcInstallStatus/FpStatus/TgStatus snapshots, refresh reconciliation, and export a new diagnostics bundle for the maintenance record.',
      relatedIssueCodes: [],
      dryRunOnly: true,
      sendsDomsCommand: false,
      plannedJplCommandName:
        'FcInstallStatus_req / FpStatus_req / TgStatus_req',
      plannedJplSubCode: null,
      safetyNote:
        'The plan only documents verification reads; it does not send them automatically.',
    } satisfies MaintenanceStep,
  ]
}

export async function getDomsMaintenancePlan(stationId: string) {
  const reconciliation = await getDomsConfigurationReconciliation(stationId)
  const steps = [
    ...buildSnapshotSteps(reconciliation),
    ...buildSuggestionSteps(reconciliation),
    ...buildPssCandidateSteps(reconciliation),
    ...buildVerificationSteps(reconciliation),
  ]
  const stepCounts = countBy(steps, (step) => step.category)
  const severityCounts = countBy(steps, (step) => step.severity)
  const pssWriteCandidates = steps.filter(
    (step) => step.category === 'pss-maintenance-candidate',
  )
  const blockingIssueCodes =
    reconciliation?.remediation?.unresolvedBlockingIssues ?? []

  return {
    ok: true,
    stationId: reconciliation.stationId ?? stationId,
    generatedAt: new Date().toISOString(),
    mode: 'dry-run',
    maintenanceMode: {
      enabled: false,
      reason:
        'This pass adds maintenance planning and audit scaffolding only. It intentionally does not enable DOMS/PSS write commands.',
    },
    safetyBoundary:
      'Dry-run maintenance plan only. No DOMS/JPL install, clear-install, or configuration write command is generated or sent.',
    readiness: {
      severity: reconciliation.severity,
      issueCount: (reconciliation.issues ?? []).length,
      suggestionCount: reconciliation?.summary?.remediationSuggestionCount ?? 0,
      unresolvedBlockingIssueCount:
        reconciliation?.summary?.unresolvedBlockingIssueCount ?? 0,
      hasFreshInstallStatus: Boolean(
        reconciliation?.summary?.installStatusSeenAt,
      ),
      pssWriteCandidateCount: pssWriteCandidates.length,
      blockingIssueCodes,
    },
    stepCounts,
    severityCounts,
    steps,
    pssWriteCandidates,
    reconciliationSummary: reconciliation.summary,
  }
}
