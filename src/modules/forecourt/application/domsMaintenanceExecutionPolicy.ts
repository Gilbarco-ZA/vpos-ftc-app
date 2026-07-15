import type { SessionUser } from '@/src/shared/types'

import { createAuditLog } from '@/src/platform/security/audit/audit-log.repository'
import { requireNonEmptyString } from '@/src/shared/utils/inputs'

import { recordForecourtEvent } from '../infrastructure/persistence'
import { listDomsMaintenanceSessions } from './domsMaintenanceSessions'

export type DomsMaintenanceExecutionPolicy = {
  stationId: string
  generatedAt: string
  mode: 'preview_only'
  scope: 'maintenance_pss_write_operations'
  hardDisabled: true
  executionEnabled: false
  sendsDomsCommand: false
  canExecute: false
  canPreview: boolean
  reason: string
  activeSession: any | null
  pendingSession: any | null
  blockers: string[]
  allowedWithoutExecution: string[]
  futureExecutionRequirements: string[]
  safetyNotice: string
}

export type RecordBlockedDomsMaintenanceExecutionInput = {
  sessionId?: unknown
  commandPreviewId?: unknown
  commandName?: unknown
  note?: unknown
  confirmExecutionDisabled?: unknown
  confirmNoDomsCommand?: unknown
  confirmPreviewOnly?: unknown
}

const MAX_NOTE_LENGTH = 1000

const maybeText = (value: unknown, maxLength = 160) => {
  if (value == null) return null
  const text = String(value).trim()
  if (!text) return null
  return text.slice(0, maxLength)
}

const requireTrue = (value: unknown, fieldName: string) => {
  if (value !== true) throw new Error(`${fieldName} must be confirmed`)
}

const parseOptionalNote = (value: unknown) => {
  if (value == null) return null
  const text = String(value).trim()
  if (!text) return null
  if (text.length > MAX_NOTE_LENGTH) {
    throw new Error(`note must be ${MAX_NOTE_LENGTH} characters or fewer`)
  }
  return text
}

async function loadSessionState(stationId: string) {
  const response = await listDomsMaintenanceSessions(
    stationId,
    new URLSearchParams({ limit: '10' }),
  )
  const data = (response as any)?.data ?? {}
  return {
    activeSession: data.activeSession ?? null,
    pendingSession: data.pendingSession ?? null,
  }
}

export async function getDomsMaintenanceExecutionPolicy(
  stationId: string,
): Promise<DomsMaintenanceExecutionPolicy> {
  const normalizedStationId = requireNonEmptyString(stationId, 'stationId')
  const { activeSession, pendingSession } =
    await loadSessionState(normalizedStationId)

  const blockers = [
    'DOMS/PSS maintenance write execution is hard-disabled in the FTC application layer.',
    'No install_Fp, clear_InstallData, install_Tg, install_Dispenser, install_Pp, or other PSS configuration write command can be executed from this maintenance flow.',
    'An approved maintenance session currently authorizes planning, preview, audit review, and FTC-side mapping work only.',
  ]

  return {
    stationId: normalizedStationId,
    generatedAt: new Date().toISOString(),
    mode: 'preview_only',
    scope: 'maintenance_pss_write_operations',
    hardDisabled: true,
    executionEnabled: false,
    sendsDomsCommand: false,
    canExecute: false,
    canPreview: Boolean(activeSession),
    reason:
      'Maintenance execution remains disabled until a later field-validated implementation explicitly enables command-by-command execution behind an additional safety gate.',
    activeSession,
    pendingSession,
    blockers,
    allowedWithoutExecution: [
      'read reconciliation status',
      'export reconciliation diagnostics',
      'apply confirmed FTC-side mapping updates',
      'rollback FTC-side mapping updates',
      'request and approve FTC maintenance sessions',
      'generate preview-only maintenance command envelopes',
      'record blocked execution attempts for audit visibility',
    ],
    futureExecutionRequirements: [
      'field engineer role or equivalent production permission',
      'approved and unexpired maintenance session',
      'fresh reconciliation snapshot from the target controller',
      'operator confirmation against PSS Configurator and physical wiring',
      'command-by-command diff between the previewed envelope and the executable envelope',
      'per-command final confirmation immediately before send',
      'global kill switch that can disable PSS write execution without a redeploy',
      'field validation on a DOMS/PSS simulator and a real controller before rollout',
    ],
    safetyNotice:
      'This policy applies only to high-risk DOMS/PSS maintenance write operations. Existing operational JPL commands remain governed by their existing APIs and operator workflows.',
  }
}

export async function recordBlockedDomsMaintenanceExecutionAttempt(
  input: RecordBlockedDomsMaintenanceExecutionInput,
  user: SessionUser,
) {
  requireTrue(input.confirmExecutionDisabled, 'confirmExecutionDisabled')
  requireTrue(input.confirmNoDomsCommand, 'confirmNoDomsCommand')
  requireTrue(input.confirmPreviewOnly, 'confirmPreviewOnly')

  const policy = await getDomsMaintenanceExecutionPolicy(user.stationId)
  const sessionId = maybeText(input.sessionId, 80)
  const note = parseOptionalNote(input.note)
  const commandPreviewId = maybeText(input.commandPreviewId, 120)
  const commandName = maybeText(input.commandName, 120)

  const audit = await createAuditLog({
    stationId: user.stationId,
    userId: user.id,
    action: 'DOMS_MAINTENANCE_EXECUTION_BLOCKED',
    entityType: 'forecourt.domsMaintenanceExecutionGate',
    entityId: sessionId ?? undefined,
    newValues: {
      blocked: true,
      executionEnabled: false,
      sendsDomsCommand: false,
      commandPreviewId,
      commandName,
    },
    metadata: {
      source: 'doms-maintenance-execution-gate',
      sessionId,
      commandPreviewId,
      commandName,
      note,
      policyMode: policy.mode,
      hardDisabled: policy.hardDisabled,
      blockers: policy.blockers,
      safetyBoundary:
        'Execution attempt was blocked in policy. No DOMS/PSS command was sent.',
    },
  })

  await recordForecourtEvent({
    stationId: user.stationId,
    source: 'admin',
    eventType: 'doms.maintenance_execution_blocked',
    payload: {
      auditLogId: audit.id,
      userId: user.id,
      username: user.username,
      sessionId,
      commandPreviewId,
      commandName,
      note,
      executionEnabled: false,
      sendsDomsCommand: false,
      blockers: policy.blockers,
    },
  })

  return {
    success: true,
    auditLogId: audit.id,
    policy,
    blockedAttempt: {
      sessionId,
      commandPreviewId,
      commandName,
      note,
      sendsDomsCommand: false,
      executionEnabled: false,
    },
  }
}
