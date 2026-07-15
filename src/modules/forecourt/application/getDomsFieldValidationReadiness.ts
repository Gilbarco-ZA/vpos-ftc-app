import type { AuditLog, SessionUser } from '@/src/shared/types'

import {
  createAuditLog,
  getAuditLogs,
} from '@/src/platform/security/audit/audit-log.repository'
import { requireNonEmptyString } from '@/src/shared/utils/inputs'

import { recordForecourtEvent } from '../infrastructure/persistence'
import { getDomsMaintenanceExecutionPolicy } from './domsMaintenanceExecutionPolicy'
import { listDomsMaintenanceSessions } from './domsMaintenanceSessions'
import { getAdminForecourtDiagnostics } from './getAdminForecourtDiagnostics'
import { getDomsConfigurationReconciliation } from './getDomsConfigurationReconciliation'
import { getJplProductionWorkflowOverview } from './getJplProductionWorkflowOverview'

export type DomsFieldValidationStatus =
  | 'passed'
  | 'pending'
  | 'warning'
  | 'blocked'

export type DomsFieldValidationArea =
  | 'build'
  | 'jpl-hardware'
  | 'operations'
  | 'reconciliation'
  | 'maintenance-safety'
  | 'tanzania-fiscalization'
  | 'cloud-cutover'

export type DomsFieldValidationChecklistItem = {
  id: string
  area: DomsFieldValidationArea
  status: DomsFieldValidationStatus
  title: string
  description: string
  evidence?: Record<string, unknown>
  nextAction: string
  blocksProduction: boolean
  manualValidationRequired: boolean
}

export type RecordDomsFieldValidationCheckpointInput = {
  checklistItemId?: unknown
  status?: unknown
  note?: unknown
  evidenceReference?: unknown
  evidence?: unknown
  confirmNoPssWrite?: unknown
  confirmManualValidation?: unknown
}

export type RecordDomsFieldValidationEvidenceImportInput = {
  action?: unknown
  evidenceType?: unknown
  sourceSystem?: unknown
  observedAt?: unknown
  note?: unknown
  evidenceReference?: unknown
  results?: unknown
  checkpoints?: unknown
  confirmNoPssWrite?: unknown
  confirmManualValidation?: unknown
}

export type DomsFieldValidationCheckpointSummary = {
  id: string
  checklistItemId: string
  status: DomsFieldValidationStatus
  note: string | null
  evidenceReference: string | null
  evidence: Record<string, unknown>
  source: string | null
  importBatchId: string | null
  recordedBy: string | null
  recordedAt: string
}

const STATUS_SCORE: Record<DomsFieldValidationStatus, number> = {
  passed: 0,
  pending: 1,
  warning: 2,
  blocked: 3,
}

const MAX_NOTE_LENGTH = 1500
const MAX_REFERENCE_LENGTH = 500

const asArray = (value: unknown): any[] => (Array.isArray(value) ? value : [])

const asObject = (value: unknown): Record<string, unknown> => {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>
  }
  return {}
}

const requireTrue = (value: unknown, fieldName: string) => {
  if (value !== true) throw new Error(`${fieldName} must be confirmed`)
}

const parseOptionalText = (
  value: unknown,
  fieldName: string,
  maxLength: number,
) => {
  if (value == null) return null
  const text = String(value).trim()
  if (!text) return null
  if (text.length > maxLength) {
    throw new Error(`${fieldName} must be ${maxLength} characters or fewer`)
  }
  return text
}

const parseCheckpointStatus = (value: unknown): DomsFieldValidationStatus => {
  const status = String(value ?? '')
    .trim()
    .toLowerCase()
  if (
    status === 'passed' ||
    status === 'pending' ||
    status === 'warning' ||
    status === 'blocked'
  ) {
    return status
  }
  throw new Error('status must be passed, pending, warning, or blocked')
}

const parseEvidenceType = (value: unknown) =>
  String(value ?? '')
    .trim()
    .toLowerCase()

const parseObservedAt = (value: unknown) => {
  if (value == null || String(value).trim() === '') {
    return new Date().toISOString()
  }
  const date = new Date(String(value))
  if (!Number.isFinite(date.getTime())) throw new Error('observedAt is invalid')
  return date.toISOString()
}

const sanitizeEvidenceObject = (value: unknown): Record<string, unknown> => {
  const input = asObject(value)
  const redacted: Record<string, unknown> = {}
  const sensitive = [
    'password',
    'secret',
    'token',
    'certificate',
    'privatekey',
    'private_key',
    'bearer',
    'apikey',
    'api_key',
  ]

  for (const [key, entry] of Object.entries(input)) {
    const normalizedKey = key.toLowerCase().replace(/[^a-z0-9_]/g, '')
    if (sensitive.some((needle) => normalizedKey.includes(needle))) {
      redacted[key] = '[redacted]'
      continue
    }
    if (entry && typeof entry === 'object') {
      redacted[key] = Array.isArray(entry)
        ? entry
            .slice(0, 100)
            .map((item) =>
              item && typeof item === 'object'
                ? sanitizeEvidenceObject(item)
                : item,
            )
        : sanitizeEvidenceObject(entry)
      continue
    }
    redacted[key] = entry
  }

  return redacted
}

const boolResult = (results: Record<string, unknown>, ...keys: string[]) => {
  for (const key of keys) {
    if (results[key] === true) return true
    if (results[key] === false) return false
  }
  return null
}

const statusFromBool = (
  value: boolean | null,
  fallback: DomsFieldValidationStatus = 'pending',
): DomsFieldValidationStatus => {
  if (value === true) return 'passed'
  if (value === false) return 'blocked'
  return fallback
}

const asCheckpointArray = (value: unknown) =>
  Array.isArray(value) ? value.slice(0, 50) : []

const normalizeCheckpointEvidence = (input: {
  checklistItemId: unknown
  status: unknown
  note?: unknown
  evidenceReference?: unknown
  evidence?: unknown
  source: string
  importBatchId?: string | null
  observedAt?: string | null
}) => ({
  checklistItemId: requireNonEmptyString(
    input.checklistItemId,
    'checklistItemId',
  ),
  status: parseCheckpointStatus(input.status),
  note: parseOptionalText(input.note, 'note', MAX_NOTE_LENGTH),
  evidenceReference: parseOptionalText(
    input.evidenceReference,
    'evidenceReference',
    MAX_REFERENCE_LENGTH,
  ),
  evidence: sanitizeEvidenceObject(input.evidence),
  source: input.source,
  importBatchId: input.importBatchId ?? null,
  observedAt: input.observedAt ?? null,
})

export const deriveDomsFieldValidationEvidenceCheckpoints = (input: {
  evidenceType?: unknown
  sourceSystem?: unknown
  observedAt?: unknown
  evidenceReference?: unknown
  note?: unknown
  results?: unknown
  checkpoints?: unknown
}) => {
  const explicit = asCheckpointArray(input.checkpoints)
  const source =
    parseEvidenceType(input.sourceSystem) ||
    parseEvidenceType(input.evidenceType) ||
    'manual-import'
  const importBatchId = `field-validation-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 8)}`
  const observedAt = parseObservedAt(input.observedAt)
  const evidenceReference = parseOptionalText(
    input.evidenceReference,
    'evidenceReference',
    MAX_REFERENCE_LENGTH,
  )
  const note = parseOptionalText(input.note, 'note', MAX_NOTE_LENGTH)
  const rawResults = sanitizeEvidenceObject(input.results)
  const nestedSummary = sanitizeEvidenceObject(rawResults.summary)
  const protocolConformance = sanitizeEvidenceObject(
    rawResults.protocolConformance,
  )
  const protocolConformanceSummary = sanitizeEvidenceObject(
    protocolConformance.summary,
  )
  const results = {
    ...rawResults,
    ...nestedSummary,
    ...protocolConformanceSummary,
  }

  if (explicit.length) {
    return explicit.map((entry: any) =>
      normalizeCheckpointEvidence({
        checklistItemId: entry?.checklistItemId ?? entry?.id,
        status: entry?.status,
        note: entry?.note ?? note,
        evidenceReference: entry?.evidenceReference ?? evidenceReference,
        evidence: {
          observedAt,
          sourceSystem: source,
          ...(results ?? {}),
          ...sanitizeEvidenceObject(entry?.evidence),
        },
        source,
        importBatchId,
        observedAt,
      }),
    )
  }

  const evidenceType = parseEvidenceType(input.evidenceType)
  const derived: Array<{
    checklistItemId: string
    status: DomsFieldValidationStatus
    note?: string | null
    evidenceReference?: string | null
    evidence?: Record<string, unknown>
    source: string
    importBatchId: string
    observedAt: string
  }> = []

  const add = (
    checklistItemId: string,
    status: DomsFieldValidationStatus,
    extraEvidence: Record<string, unknown> = {},
  ) => {
    derived.push({
      checklistItemId,
      status,
      note,
      evidenceReference,
      evidence: {
        observedAt,
        sourceSystem: source,
        evidenceType,
        ...results,
        ...extraEvidence,
      },
      source,
      importBatchId,
      observedAt,
    })
  }

  if (evidenceType === 'build-test-run' || evidenceType === 'local-build') {
    add(
      'local-build-completed',
      statusFromBool(
        boolResult(results, 'buildPassed', 'build', 'npmRunBuild'),
      ),
      { expectedCommand: 'npm run build' },
    )
    add(
      'test-suite-completed',
      statusFromBool(
        boolResult(results, 'testsPassed', 'testPassed', 'npmRunTest'),
      ),
      { expectedCommand: 'npm run test && npm run test:jpl-protocol' },
    )
  } else if (evidenceType === 'jpl-simulator') {
    add(
      'jpl-live-connection-observed',
      statusFromBool(
        boolResult(results, 'connected', 'logonPassed', 'heartbeatPassed'),
        'warning',
      ),
    )
    add(
      'production-workflows-exercised',
      statusFromBool(
        boolResult(results, 'workflowsPassed', 'pumpWorkflowPassed'),
        'warning',
      ),
    )
  } else if (
    evidenceType === 'jpl-session-resilience' ||
    evidenceType === 'network-interruption'
  ) {
    add(
      'jpl-network-reconnect-validated',
      statusFromBool(
        boolResult(
          results,
          'reconnected',
          'forcedDisconnectRecovered',
          'networkInterruptionRecovered',
        ),
      ),
    )
    add(
      'jpl-dead-connection-detection-validated',
      statusFromBool(
        boolResult(results, 'deadConnectionDetected', 'timeoutDetected'),
      ),
    )
    add(
      'jpl-transaction-recovery-validated',
      statusFromBool(
        boolResult(
          results,
          'transactionRecoveredAfterRestart',
          'transactionRecoveryPassed',
        ),
      ),
    )
    add(
      'jpl-heartbeat-resilience-validated',
      statusFromBool(
        boolResult(
          results,
          'serverHeartbeatObserved',
          'clientHeartbeatObserved',
          'heartbeatPassed',
        ),
      ),
    )
  } else if (evidenceType === 'live-controller') {
    add(
      'jpl-live-connection-observed',
      statusFromBool(
        boolResult(results, 'connected', 'logonPassed'),
        'warning',
      ),
    )
    add(
      'fc-install-status-snapshot-captured',
      statusFromBool(boolResult(results, 'installStatusCaptured'), 'warning'),
    )
    add(
      'reconciliation-reviewed',
      statusFromBool(boolResult(results, 'reconciliationAccepted'), 'warning'),
    )
    add(
      'production-workflows-exercised',
      statusFromBool(boolResult(results, 'workflowsPassed'), 'warning'),
    )
    add(
      'jpl-live-fp-status-conformance-validated',
      statusFromBool(boolResult(results, 'fpStatusParserValidated'), 'pending'),
    )
    add(
      'jpl-live-value-normalization-validated',
      statusFromBool(
        boolResult(results, 'valueNormalizationValidated'),
        'pending',
      ),
    )
  } else if (
    evidenceType === 'jpl-live-conformance' ||
    evidenceType === 'live-readonly-validation'
  ) {
    add(
      'jpl-live-fp-status-conformance-validated',
      statusFromBool(boolResult(results, 'fpStatusParserValidated')),
    )
    add(
      'jpl-live-value-normalization-validated',
      statusFromBool(boolResult(results, 'valueNormalizationValidated')),
    )
  } else if (evidenceType === 'tanzania-endpoint') {
    add(
      'tanzania-tra-sale-validated',
      statusFromBool(boolResult(results, 'salePassed', 'traSalePassed')),
    )
    add(
      'tanzania-credit-note-validated',
      statusFromBool(boolResult(results, 'creditNotePassed', 'reversalPassed')),
    )
  } else if (evidenceType === 'cloud-cutover') {
    add(
      'cloud-cutover-checklist-ready',
      statusFromBool(
        boolResult(results, 'cutoverRehearsed', 'ready'),
        'warning',
      ),
    )
  }

  if (!derived.length) {
    throw new Error(
      'checkpoints are required when evidenceType is not a supported automatic import type',
    )
  }

  return derived.map((entry) => normalizeCheckpointEvidence(entry))
}

const addItem = (
  items: DomsFieldValidationChecklistItem[],
  item: DomsFieldValidationChecklistItem,
) => {
  items.push(item)
}

const maxStatus = (items: DomsFieldValidationChecklistItem[]) => {
  let status: DomsFieldValidationStatus = 'passed'
  for (const item of items) {
    if (STATUS_SCORE[item.status] > STATUS_SCORE[status]) status = item.status
  }
  return status
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

const ageMinutes = (value: unknown) => {
  if (value == null || value === '') return null
  const date = new Date(String(value))
  if (!Number.isFinite(date.getTime())) return null
  return Math.max(0, Math.round((Date.now() - date.getTime()) / 60_000))
}

const deriveConnectionStatus = (diagnostics: any) => {
  const connection = asObject(diagnostics?.connection)
  const adapterState = asObject(diagnostics?.adapterState)
  const statusText = String(
    connection.status ??
      adapterState.status ??
      adapterState.connectionStatus ??
      '',
  ).toLowerCase()
  const connected =
    connection.connected === true ||
    adapterState.connected === true ||
    statusText === 'connected' ||
    statusText === 'online'
  return { connection, adapterState, connected, statusText }
}

const buildChecklist = (params: {
  diagnostics: any
  reconciliation: any
  workflow: any
  executionPolicy: any
  maintenanceSessions: any
}) => {
  const items: DomsFieldValidationChecklistItem[] = []
  const {
    diagnostics,
    reconciliation,
    workflow,
    executionPolicy,
    maintenanceSessions,
  } = params
  const { connected, statusText } = deriveConnectionStatus(diagnostics)
  const recentRejects = asArray(diagnostics?.recent?.rejects)
  const protocolEvents = asArray(diagnostics?.recent?.protocolEvents)
  const activeSession = maintenanceSessions?.data?.activeSession ?? null
  const installStatusSeenAt =
    reconciliation?.summary?.installStatusSeenAt ?? null
  const reconciliationSeverity = String(reconciliation?.severity ?? 'warning')
  const issueCount = Number(reconciliation?.issues?.length ?? 0)
  const workflowCommands = asArray(
    workflow?.data?.commands ?? workflow?.commands ?? workflow?.commandHistory,
  )
  const workflowTransactions = asArray(
    workflow?.data?.transactions ?? workflow?.transactions,
  )

  addItem(items, {
    id: 'local-build-completed',
    area: 'build',
    status: 'pending',
    title: 'Local production build has been run on the latest package',
    description:
      'Generated packages are parse checked in this environment, but the production Next.js build must be run on the local development machine with dependencies installed.',
    evidence: {
      expectedCommand: 'npm run build',
      source: 'manual-local-validation',
    },
    nextAction:
      'Run npm run build locally and record the result as a validation checkpoint.',
    blocksProduction: true,
    manualValidationRequired: true,
  })

  addItem(items, {
    id: 'test-suite-completed',
    area: 'build',
    status: 'pending',
    title: 'Automated tests have been run on the latest package',
    description:
      'Run the full test suite and the JPL protocol-focused tests after applying this pass.',
    evidence: {
      expectedCommands: [
        'npm run test',
        'npm run test -- tests/runtime/jplProtocol.test.ts',
      ],
    },
    nextAction:
      'Run the full test suite locally, fix any failures, and record the result.',
    blocksProduction: true,
    manualValidationRequired: true,
  })

  addItem(items, {
    id: 'jpl-live-connection-observed',
    area: 'jpl-hardware',
    status: connected ? 'passed' : 'warning',
    title: 'JPL connection observed by diagnostics',
    description:
      'The app should show a live connection or recent JPL traffic before field acceptance can proceed.',
    evidence: {
      connected,
      status: statusText || null,
      lastAnyReceivedAt: diagnostics?.lastAnyReceivedAt ?? null,
      lastMessageAgeMinutes: ageMinutes(diagnostics?.lastAnyReceivedAt),
    },
    nextAction: connected
      ? 'Proceed with command-specific simulator/field validation.'
      : 'Connect to a DOMS/PSS simulator or real controller and verify logon, heartbeat, and status traffic.',
    blocksProduction: !connected,
    manualValidationRequired: true,
  })

  addItem(items, {
    id: 'jpl-network-reconnect-validated',
    area: 'jpl-hardware',
    status: 'pending',
    title: 'Network interruption and reconnect behavior validated',
    description:
      'A forced socket interruption must be followed by a clean reconnect, fresh logon, and resumed status traffic without manual process restart.',
    evidence: {
      expectedEvidenceType: 'jpl-session-resilience',
      expectedSignals: [
        'forcedDisconnectObserved',
        'reconnected',
        'logonPassed',
      ],
    },
    nextAction:
      'Run npm run doms:jpl-session:selftest or an equivalent controlled field interruption and import the generated resilience evidence.',
    blocksProduction: true,
    manualValidationRequired: true,
  })

  addItem(items, {
    id: 'jpl-dead-connection-detection-validated',
    area: 'jpl-hardware',
    status: 'pending',
    title: 'Dead JPL connection detection validated',
    description:
      'The client must treat the connection as dead after the configured no-message timeout, close the stale socket, and permit reconnect handling to take over.',
    evidence: {
      expectedEvidenceType: 'jpl-session-resilience',
      expectedSignal: 'deadConnectionDetected',
    },
    nextAction:
      'Pause simulator/controller heartbeats in a controlled test and import evidence showing timeout detection.',
    blocksProduction: true,
    manualValidationRequired: true,
  })

  addItem(items, {
    id: 'jpl-transaction-recovery-validated',
    area: 'operations',
    status: 'pending',
    title: 'Transaction recovery across reconnect validated',
    description:
      'A transaction read before interruption must be rediscovered with the same FpId, TransSeqNo, and transaction values after reconnect, without duplicate clearing.',
    evidence: {
      expectedEvidenceType: 'jpl-session-resilience',
      expectedSignal: 'transactionRecoveredAfterRestart',
    },
    nextAction:
      'Run the transaction-recovery resilience scenario and import the generated evidence report.',
    blocksProduction: true,
    manualValidationRequired: true,
  })

  addItem(items, {
    id: 'jpl-heartbeat-resilience-validated',
    area: 'jpl-hardware',
    status: 'pending',
    title: 'Bidirectional JPL heartbeat handling validated',
    description:
      'Evidence must show both server heartbeat observation and client heartbeat delivery before the session is accepted as resilient.',
    evidence: {
      expectedEvidenceType: 'jpl-session-resilience',
      expectedSignals: ['serverHeartbeatObserved', 'clientHeartbeatObserved'],
    },
    nextAction:
      'Run the session resilience self-test and import its heartbeat evidence.',
    blocksProduction: true,
    manualValidationRequired: true,
  })

  addItem(items, {
    id: 'jpl-live-fp-status-conformance-validated',
    area: 'jpl-hardware',
    status: 'pending',
    title: 'Live FpStatus payload conformance validated',
    description:
      'A read-only live-controller report must demonstrate that solicited, unsolicited, and MultiMessage FpStatus payloads normalize every field used by application workflows.',
    evidence: {
      expectedEvidenceType: 'live-controller',
      expectedSignal: 'fpStatusParserValidated',
      acceptedSources: [
        'doms-jpl-live-readonly-validation-runner',
        'jpl-live-conformance',
      ],
    },
    nextAction:
      'Run the full-readonly live validator against the target PSS, review protocolConformance findings, and import the generated evidence file.',
    blocksProduction: true,
    manualValidationRequired: true,
  })

  addItem(items, {
    id: 'jpl-live-value-normalization-validated',
    area: 'operations',
    status: 'pending',
    title: 'Live money and volume normalization validated',
    description:
      'Live FpFuellingData values must be verified with the site money and volume decimal positions so persisted amounts match the controller display and fiscal workflow.',
    evidence: {
      expectedEvidenceType: 'live-controller',
      expectedSignal: 'valueNormalizationValidated',
      requiredConfiguration: ['moneyDecimals', 'volumeDecimals'],
    },
    nextAction:
      'Run the full-readonly live validator with explicit --money-decimals and --volume-decimals values, compare the normalized observations with the PSS, and import the evidence.',
    blocksProduction: true,
    manualValidationRequired: true,
  })

  addItem(items, {
    id: 'jpl-rejects-reviewed',
    area: 'jpl-hardware',
    status: recentRejects.length > 0 ? 'warning' : 'passed',
    title: 'Recent JPL rejects reviewed',
    description:
      'Recent RejectMessage responses should be explained before the site is accepted.',
    evidence: {
      recentRejectCount: recentRejects.length,
      recentProtocolEventCount: protocolEvents.length,
    },
    nextAction: recentRejects.length
      ? 'Open the diagnostics panel, review RejectInfoText values, and fix command/schema/access issues.'
      : 'Continue monitoring rejects during simulator and field testing.',
    blocksProduction: recentRejects.length > 0,
    manualValidationRequired: true,
  })

  addItem(items, {
    id: 'production-workflows-exercised',
    area: 'operations',
    status:
      workflowCommands.length > 0 || workflowTransactions.length > 0
        ? 'warning'
        : 'pending',
    title: 'Production JPL workflows exercised and reviewed',
    description:
      'Pump, wetstock, price-bank, and utility workflows should be exercised against a simulator or real controller, then reviewed in command history.',
    evidence: {
      commandHistoryCount: workflowCommands.length,
      recentTransactionCount: workflowTransactions.length,
    },
    nextAction:
      'Run the operational workflows from the Forecourt admin page and record command-history evidence.',
    blocksProduction: true,
    manualValidationRequired: true,
  })

  addItem(items, {
    id: 'fc-install-status-snapshot-captured',
    area: 'reconciliation',
    status: installStatusSeenAt ? 'passed' : 'warning',
    title: 'DOMS FcInstallStatus snapshot captured',
    description:
      'Reconciliation should be based on DOMS installation status, not only runtime events.',
    evidence: {
      installStatusSeenAt,
    },
    nextAction: installStatusSeenAt
      ? 'Refresh reconciliation after every mapping or PSS Configurator change.'
      : 'Collect FcInstallStatus from DOMS/JPL and refresh reconciliation.',
    blocksProduction: !installStatusSeenAt,
    manualValidationRequired: true,
  })

  addItem(items, {
    id: 'reconciliation-reviewed',
    area: 'reconciliation',
    status:
      reconciliationSeverity === 'ok' || reconciliationSeverity === 'info'
        ? 'passed'
        : issueCount > 0
          ? 'warning'
          : 'pending',
    title: 'DOMS/FTC reconciliation reviewed',
    description:
      'Observed DOMS pumps, tanks, tank gauges, and FTC mappings should be reviewed and accepted before live rollout.',
    evidence: {
      severity: reconciliationSeverity,
      issueCount,
      suggestionCount: reconciliation?.summary?.remediationSuggestionCount ?? 0,
      blockingIssueCount:
        reconciliation?.summary?.unresolvedBlockingIssueCount ?? 0,
    },
    nextAction:
      'Resolve FTC mapping suggestions, export reconciliation diagnostics, and record acceptance notes.',
    blocksProduction: issueCount > 0,
    manualValidationRequired: true,
  })

  addItem(items, {
    id: 'maintenance-execution-disabled',
    area: 'maintenance-safety',
    status:
      executionPolicy?.hardDisabled === true &&
      executionPolicy?.canExecute === false
        ? 'passed'
        : 'blocked',
    title: 'DOMS/PSS maintenance write execution is hard-disabled',
    description:
      'High-risk install and clear-install commands must remain disabled until field validation and role policy approval are complete.',
    evidence: {
      mode: executionPolicy?.mode ?? null,
      hardDisabled: executionPolicy?.hardDisabled ?? null,
      canExecute: executionPolicy?.canExecute ?? null,
      activeSessionId: activeSession?.id ?? null,
    },
    nextAction:
      'Keep execution disabled. Use maintenance sessions and previews for planning only.',
    blocksProduction: executionPolicy?.hardDisabled !== true,
    manualValidationRequired: false,
  })

  addItem(items, {
    id: 'tanzania-tra-sale-validated',
    area: 'tanzania-fiscalization',
    status: 'pending',
    title: 'Tanzania local sale fiscalization validated against TRA/EWURA',
    description:
      'The local Tanzania route is implemented, but real endpoint validation is still required.',
    evidence: {
      implementationState: 'sales route implemented; live validation pending',
    },
    nextAction:
      'Run a controlled Tanzania local_tz sale against the test/production-approved endpoint and record TRA/EWURA evidence.',
    blocksProduction: true,
    manualValidationRequired: true,
  })

  addItem(items, {
    id: 'tanzania-credit-note-validated',
    area: 'tanzania-fiscalization',
    status: 'pending',
    title: 'Tanzania local credit-note reversal validated',
    description:
      'Credit notes are implemented as local Tanzania reversal documents, but acceptance must be confirmed with the Tanzania endpoints.',
    evidence: {
      implementationState:
        'credit-note route implemented; live validation pending',
    },
    nextAction:
      'Validate the negative-value reversal/credit-note payload with TRA/EWURA and record endpoint evidence.',
    blocksProduction: true,
    manualValidationRequired: true,
  })

  addItem(items, {
    id: 'cloud-cutover-checklist-ready',
    area: 'cloud-cutover',
    status: 'pending',
    title: 'Tanzania cloud cutover checklist prepared and rehearsed',
    description:
      'Before switching local_tz sites to proxy/cloud fiscalization, queue safety and rollback steps must be rehearsed.',
    evidence: {
      implementationState:
        'route switch implemented; queue safety checklist pending',
    },
    nextAction:
      'Add and validate pre-switch queue checks, last-successful-route evidence, and rollback notes.',
    blocksProduction: false,
    manualValidationRequired: true,
  })

  return items
}

const checkpointFromAuditLog = (
  row: AuditLog,
): DomsFieldValidationCheckpointSummary | null => {
  const values = asObject(row.newValues)
  const metadata = asObject(row.metadata)
  const checklistItemId = String(
    values.checklistItemId ?? row.entityId ?? '',
  ).trim()
  if (!checklistItemId) return null

  let status: DomsFieldValidationStatus
  try {
    status = parseCheckpointStatus(values.status)
  } catch {
    return null
  }

  return {
    id: row.id,
    checklistItemId,
    status,
    note: typeof values.note === 'string' ? values.note : null,
    evidenceReference:
      typeof values.evidenceReference === 'string'
        ? values.evidenceReference
        : null,
    evidence: sanitizeEvidenceObject(values.evidence ?? metadata.evidence),
    source: typeof metadata.source === 'string' ? metadata.source : null,
    importBatchId:
      typeof metadata.importBatchId === 'string'
        ? metadata.importBatchId
        : null,
    recordedBy: row.userId ?? null,
    recordedAt: row.createdAt.toISOString(),
  }
}

async function loadDomsFieldValidationCheckpoints(stationId: string) {
  const { logs } = await getAuditLogs({
    stationId,
    action: 'DOMS_FIELD_VALIDATION_CHECKPOINT_RECORDED',
    entityType: 'forecourt.domsFieldValidation',
    limit: 100,
  })

  return logs
    .map(checkpointFromAuditLog)
    .filter(Boolean) as DomsFieldValidationCheckpointSummary[]
}

export const applyDomsFieldValidationCheckpoints = (
  checklist: DomsFieldValidationChecklistItem[],
  checkpoints: DomsFieldValidationCheckpointSummary[],
) => {
  const latestByItem = new Map<string, DomsFieldValidationCheckpointSummary>()
  for (const checkpoint of checkpoints) {
    const existing = latestByItem.get(checkpoint.checklistItemId)
    if (
      !existing ||
      new Date(checkpoint.recordedAt).getTime() >
        new Date(existing.recordedAt).getTime()
    ) {
      latestByItem.set(checkpoint.checklistItemId, checkpoint)
    }
  }

  return checklist.map((item) => {
    const checkpoint = latestByItem.get(item.id)
    if (!checkpoint) return item

    return {
      ...item,
      status: checkpoint.status,
      evidence: {
        ...(item.evidence ?? {}),
        manualCheckpoint: checkpoint,
      },
      nextAction:
        checkpoint.status === 'passed'
          ? 'Checkpoint evidence has been recorded. Keep monitoring and update this item if later validation changes.'
          : item.nextAction,
    }
  })
}

const buildReleaseGate = (
  checklist: DomsFieldValidationChecklistItem[],
  checkpoints: DomsFieldValidationCheckpointSummary[],
) => {
  const productionBlockers = checklist.filter(
    (item) => item.blocksProduction && item.status !== 'passed',
  )
  const requiredItems = checklist.filter((item) => item.blocksProduction)
  const latestCheckpointAt = checkpoints[0]?.recordedAt ?? null

  return {
    status: productionBlockers.length ? 'blocked' : 'ready-for-final-review',
    generatedAt: new Date().toISOString(),
    requiredChecklistItemIds: requiredItems.map((item) => item.id),
    satisfiedRequirementIds: requiredItems
      .filter((item) => item.status === 'passed')
      .map((item) => item.id),
    unsatisfiedRequirementIds: productionBlockers.map((item) => item.id),
    blockerCount: productionBlockers.length,
    checkpointCount: checkpoints.length,
    latestCheckpointAt,
    pssWriteExecutionStillDisabled: true,
    tanzaniaValidationRequired: productionBlockers.some(
      (item) => item.area === 'tanzania-fiscalization',
    ),
    fieldValidationRequired: productionBlockers.some(
      (item) => item.manualValidationRequired,
    ),
    safetyBoundary:
      'Release gate evaluates recorded evidence only. It does not send DOMS/PSS commands, alter FTC mappings, or switch fiscalization routing.',
  }
}

async function writeFieldValidationCheckpointAudit(params: {
  user: SessionUser
  checklistItemId: string
  status: DomsFieldValidationStatus
  note: string | null
  evidenceReference: string | null
  evidence?: Record<string, unknown>
  itemTitle?: string | null
  itemArea?: string | null
  source: string
  importBatchId?: string | null
  readinessGeneratedAt?: string | null
  overallStatus?: string | null
  productionReleaseStatus?: string | null
}) {
  const audit = await createAuditLog({
    stationId: params.user.stationId,
    userId: params.user.id,
    action: 'DOMS_FIELD_VALIDATION_CHECKPOINT_RECORDED',
    entityType: 'forecourt.domsFieldValidation',
    entityId: params.checklistItemId,
    newValues: {
      checklistItemId: params.checklistItemId,
      status: params.status,
      note: params.note,
      evidenceReference: params.evidenceReference,
      evidence: sanitizeEvidenceObject(params.evidence),
      itemTitle: params.itemTitle ?? null,
      itemArea: params.itemArea ?? null,
    },
    metadata: {
      source: params.source,
      importBatchId: params.importBatchId ?? null,
      readinessGeneratedAt: params.readinessGeneratedAt ?? null,
      overallStatus: params.overallStatus ?? null,
      productionReleaseStatus: params.productionReleaseStatus ?? null,
      confirmNoPssWrite: true,
      confirmManualValidation: true,
      safetyBoundary:
        'Field validation checkpoint records audit evidence only. No DOMS/PSS command was sent and no FTC mapping or fiscalization route was changed.',
    },
  })

  await recordForecourtEvent({
    stationId: params.user.stationId,
    source: 'admin',
    eventType: 'doms.field_validation_checkpoint_recorded',
    payload: {
      auditLogId: audit.id,
      userId: params.user.id,
      username: params.user.username,
      checklistItemId: params.checklistItemId,
      status: params.status,
      note: params.note,
      evidenceReference: params.evidenceReference,
      itemTitle: params.itemTitle ?? null,
      itemArea: params.itemArea ?? null,
      importBatchId: params.importBatchId ?? null,
      sendsDomsCommand: false,
    },
  })

  return audit
}

export async function getDomsFieldValidationReadiness(stationId: string) {
  const normalizedStationId = requireNonEmptyString(stationId, 'stationId')
  const [
    diagnostics,
    reconciliation,
    workflow,
    executionPolicy,
    maintenanceSessions,
  ] = await Promise.all([
    getAdminForecourtDiagnostics(normalizedStationId),
    getDomsConfigurationReconciliation(normalizedStationId),
    getJplProductionWorkflowOverview(
      normalizedStationId,
      new URLSearchParams({ limit: '50' }),
    ),
    getDomsMaintenanceExecutionPolicy(normalizedStationId),
    listDomsMaintenanceSessions(
      normalizedStationId,
      new URLSearchParams({ limit: '20' }),
    ),
  ])

  const baselineChecklist = buildChecklist({
    diagnostics,
    reconciliation,
    workflow,
    executionPolicy,
    maintenanceSessions,
  })
  const checkpoints =
    await loadDomsFieldValidationCheckpoints(normalizedStationId)
  const checklist = applyDomsFieldValidationCheckpoints(
    baselineChecklist,
    checkpoints,
  )
  const releaseGate = buildReleaseGate(checklist, checkpoints)
  const statusCounts = countBy(checklist, (item) => item.status)
  const areaCounts = countBy(checklist, (item) => item.area)
  const blockingItems = checklist.filter(
    (item) => item.blocksProduction && item.status !== 'passed',
  )
  const manualItems = checklist.filter((item) => item.manualValidationRequired)
  const overallStatus = maxStatus(checklist)
  const latestCheckpointsByItem = Object.fromEntries(
    checklist
      .map((item) => {
        const checkpoint = checkpoints.find(
          (candidate) => candidate.checklistItemId === item.id,
        )
        return checkpoint ? [item.id, checkpoint] : null
      })
      .filter(Boolean) as Array<[string, DomsFieldValidationCheckpointSummary]>,
  )

  return {
    success: true,
    stationId: normalizedStationId,
    generatedAt: new Date().toISOString(),
    mode: 'field-validation-readiness',
    overallStatus,
    productionReleaseStatus: releaseGate.status,
    safetyNotice:
      'This readiness report is diagnostic and audit-support only. It does not send DOMS/PSS commands, modify FTC mappings, or change Tanzania fiscalization routing.',
    releaseGate,
    summary: {
      totalItems: checklist.length,
      passed: statusCounts.passed ?? 0,
      pending: statusCounts.pending ?? 0,
      warning: statusCounts.warning ?? 0,
      blocked: statusCounts.blocked ?? 0,
      blockingItemCount: blockingItems.length,
      manualValidationItemCount: manualItems.length,
      checkpointCount: checkpoints.length,
      latestCheckpointAt: checkpoints[0]?.recordedAt ?? null,
      areaCounts,
    },
    checklist,
    blockingItems,
    manualValidationItems: manualItems,
    recentCheckpoints: checkpoints.slice(0, 20),
    latestCheckpointsByItem,
    sourceSnapshots: {
      diagnostics: {
        connection: diagnostics?.connection ?? null,
        lastAnyReceivedAt: diagnostics?.lastAnyReceivedAt ?? null,
        recentRejectCount: asArray(diagnostics?.recent?.rejects).length,
      },
      reconciliation: {
        severity: reconciliation?.severity ?? null,
        summary: reconciliation?.summary ?? null,
      },
      maintenance: {
        executionPolicy: {
          mode: executionPolicy?.mode ?? null,
          hardDisabled: executionPolicy?.hardDisabled ?? null,
          canExecute: executionPolicy?.canExecute ?? null,
          canPreview: executionPolicy?.canPreview ?? null,
        },
        activeSession: maintenanceSessions?.data?.activeSession ?? null,
        pendingSession: maintenanceSessions?.data?.pendingSession ?? null,
      },
    },
  }
}

export async function recordDomsFieldValidationCheckpoint(
  input: RecordDomsFieldValidationCheckpointInput,
  user: SessionUser,
) {
  requireTrue(input.confirmNoPssWrite, 'confirmNoPssWrite')
  requireTrue(input.confirmManualValidation, 'confirmManualValidation')

  const checklistItemId = requireNonEmptyString(
    input.checklistItemId,
    'checklistItemId',
  )
  const status = parseCheckpointStatus(input.status)
  const note = parseOptionalText(input.note, 'note', MAX_NOTE_LENGTH)
  const evidenceReference = parseOptionalText(
    input.evidenceReference,
    'evidenceReference',
    MAX_REFERENCE_LENGTH,
  )
  const evidence = sanitizeEvidenceObject(input.evidence)
  if (!note && !evidenceReference && !Object.keys(evidence).length) {
    throw new Error('note, evidenceReference, or evidence is required')
  }

  const readiness = await getDomsFieldValidationReadiness(user.stationId)
  const item = readiness.checklist.find(
    (candidate) => candidate.id === checklistItemId,
  )
  if (!item) throw new Error('Unknown checklist item')

  const audit = await writeFieldValidationCheckpointAudit({
    user,
    checklistItemId,
    status,
    note,
    evidenceReference,
    evidence,
    itemTitle: item.title,
    itemArea: item.area,
    source: 'doms-field-validation-readiness',
    readinessGeneratedAt: readiness.generatedAt,
    overallStatus: readiness.overallStatus,
    productionReleaseStatus: readiness.productionReleaseStatus,
  })

  const updatedReadiness = await getDomsFieldValidationReadiness(user.stationId)

  return {
    success: true,
    auditLogId: audit.id,
    checkpoint: {
      checklistItemId,
      status,
      note,
      evidenceReference,
      evidence,
      item,
      sendsDomsCommand: false,
    },
    readiness: updatedReadiness,
  }
}

export async function recordDomsFieldValidationEvidenceImport(
  input: RecordDomsFieldValidationEvidenceImportInput,
  user: SessionUser,
) {
  requireTrue(input.confirmNoPssWrite, 'confirmNoPssWrite')
  requireTrue(input.confirmManualValidation, 'confirmManualValidation')

  const readiness = await getDomsFieldValidationReadiness(user.stationId)
  const knownItems = new Map(
    readiness.checklist.map((item) => [item.id, item] as const),
  )
  const checkpoints = deriveDomsFieldValidationEvidenceCheckpoints(input)

  const audits = []
  for (const checkpoint of checkpoints) {
    const item = knownItems.get(checkpoint.checklistItemId)
    if (!item) {
      throw new Error(
        `Unknown checklist item in evidence import: ${checkpoint.checklistItemId}`,
      )
    }

    const audit = await writeFieldValidationCheckpointAudit({
      user,
      checklistItemId: checkpoint.checklistItemId,
      status: checkpoint.status,
      note: checkpoint.note,
      evidenceReference: checkpoint.evidenceReference,
      evidence: checkpoint.evidence,
      itemTitle: item.title,
      itemArea: item.area,
      source: checkpoint.source || 'doms-field-validation-evidence-import',
      importBatchId: checkpoint.importBatchId,
      readinessGeneratedAt: readiness.generatedAt,
      overallStatus: readiness.overallStatus,
      productionReleaseStatus: readiness.productionReleaseStatus,
    })
    audits.push({ audit, checkpoint, item })
  }

  await recordForecourtEvent({
    stationId: user.stationId,
    source: 'admin',
    eventType: 'doms.field_validation_evidence_imported',
    payload: {
      userId: user.id,
      username: user.username,
      evidenceType: parseEvidenceType(input.evidenceType) || null,
      sourceSystem: parseEvidenceType(input.sourceSystem) || null,
      importBatchId: checkpoints[0]?.importBatchId ?? null,
      checkpointCount: checkpoints.length,
      auditLogIds: audits.map((entry) => entry.audit.id),
      sendsDomsCommand: false,
    },
  })

  const updatedReadiness = await getDomsFieldValidationReadiness(user.stationId)

  return {
    success: true,
    importBatchId: checkpoints[0]?.importBatchId ?? null,
    checkpointCount: checkpoints.length,
    auditLogIds: audits.map((entry) => entry.audit.id),
    checkpoints: audits.map((entry) => ({
      checklistItemId: entry.checkpoint.checklistItemId,
      status: entry.checkpoint.status,
      note: entry.checkpoint.note,
      evidenceReference: entry.checkpoint.evidenceReference,
      itemTitle: entry.item.title,
      itemArea: entry.item.area,
      auditLogId: entry.audit.id,
      sendsDomsCommand: false,
    })),
    releaseGate: updatedReadiness.releaseGate,
    readiness: updatedReadiness,
  }
}
