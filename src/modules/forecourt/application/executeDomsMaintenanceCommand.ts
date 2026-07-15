import type { SessionUser } from '@/src/shared/types'

import { createAuditLog } from '@/src/platform/security/audit/audit-log.repository'

import { sendDomsMaintenanceJplEnvelope } from '../infrastructure/jpl/maintenanceExecution'
import {
  claimDomsMaintenanceExecutionPermit,
  completeDomsMaintenanceExecutionClaim,
} from '../infrastructure/jpl/maintenanceExecutionClaimRepository'
import { recordForecourtEvent } from '../infrastructure/persistence'
import {
  digestDomsMaintenanceValue,
  validateDomsMaintenanceEnvelope,
} from './domsMaintenanceCommandDigest'
import { verifyDomsMaintenanceExecutionPermitSignature } from './domsMaintenanceExecutionPermit'

export type DomsMaintenanceExecutionPermit = {
  version?: unknown
  stationId?: unknown
  sessionId?: unknown
  commandName?: unknown
  commandDigest?: unknown
  confirmationId?: unknown
  targetFingerprint?: unknown
  deploymentSignOffId?: unknown
  acceptanceDigest?: unknown
  deploymentArtifact?: unknown
  issuedAt?: unknown
  expiresAt?: unknown
  issuedTo?: unknown
  signature?: unknown
}

export type ExecuteDomsMaintenanceCommandInput = {
  permit?: unknown
  envelope?: unknown
  confirmImmediateExecution?: unknown
  confirmPermitWillBeConsumed?: unknown
}

type ExecutionEnvironment = {
  DOMS_PSS_WRITE_EXECUTION_ENABLED?: string
  DOMS_PSS_WRITE_KILL_SWITCH?: string
  DOMS_PSS_WRITE_PERMIT_SECRET?: string
  DOMS_PSS_TARGET_FINGERPRINT?: string
}

type Dependencies = {
  claimPermit: typeof claimDomsMaintenanceExecutionPermit
  completeClaim: typeof completeDomsMaintenanceExecutionClaim
  sendEnvelope: typeof sendDomsMaintenanceJplEnvelope
  createAudit: typeof createAuditLog
  recordEvent: typeof recordForecourtEvent
}

const stringField = (value: unknown, field: string) => {
  const result = String(value ?? '').trim()
  if (!result) throw new Error(`${field} is required`)
  return result
}

const parsePermit = (value: unknown) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('permit is required')
  }
  const permit = value as DomsMaintenanceExecutionPermit
  return {
    version: Number(permit.version),
    stationId: stringField(permit.stationId, 'permit.stationId'),
    sessionId: stringField(permit.sessionId, 'permit.sessionId'),
    commandName: stringField(permit.commandName, 'permit.commandName'),
    commandDigest: stringField(permit.commandDigest, 'permit.commandDigest'),
    confirmationId: stringField(permit.confirmationId, 'permit.confirmationId'),
    targetFingerprint: stringField(
      permit.targetFingerprint,
      'permit.targetFingerprint',
    ),
    deploymentSignOffId: stringField(
      permit.deploymentSignOffId,
      'permit.deploymentSignOffId',
    ),
    acceptanceDigest: stringField(
      permit.acceptanceDigest,
      'permit.acceptanceDigest',
    ),
    deploymentArtifact: stringField(
      permit.deploymentArtifact,
      'permit.deploymentArtifact',
    ),
    issuedAt: stringField(permit.issuedAt, 'permit.issuedAt'),
    expiresAt: stringField(permit.expiresAt, 'permit.expiresAt'),
    issuedTo: stringField(permit.issuedTo, 'permit.issuedTo'),
    signature: stringField(permit.signature, 'permit.signature'),
  }
}

const permitPayload = (permit: ReturnType<typeof parsePermit>) =>
  [
    permit.stationId,
    permit.sessionId,
    permit.commandName,
    permit.commandDigest,
    permit.confirmationId,
    permit.targetFingerprint,
    permit.deploymentSignOffId,
    permit.acceptanceDigest,
    permit.issuedAt,
    permit.expiresAt,
    permit.issuedTo,
  ].join('|')

export async function executeDomsMaintenanceCommand(
  input: ExecuteDomsMaintenanceCommandInput,
  user: SessionUser,
  options: {
    env?: ExecutionEnvironment
    now?: Date
    dependencies?: Partial<Dependencies>
  } = {},
) {
  if (input.confirmImmediateExecution !== true) {
    throw new Error('confirmImmediateExecution must be confirmed')
  }
  if (input.confirmPermitWillBeConsumed !== true) {
    throw new Error('confirmPermitWillBeConsumed must be confirmed')
  }
  if (user.role !== 'field_engineer')
    throw new Error('field_engineer role required')

  const env = options.env ?? process.env
  if (env.DOMS_PSS_WRITE_EXECUTION_ENABLED !== 'true') {
    throw new Error('PSS write execution feature flag is disabled')
  }
  if (env.DOMS_PSS_WRITE_KILL_SWITCH !== 'false') {
    throw new Error('PSS write kill switch is active')
  }

  const secret = env.DOMS_PSS_WRITE_PERMIT_SECRET ?? ''
  if (secret.length < 32)
    throw new Error('permit signing secret is not configured securely')
  const expectedTarget = String(env.DOMS_PSS_TARGET_FINGERPRINT ?? '').trim()
  if (!expectedTarget)
    throw new Error('trusted PSS target fingerprint is not configured')

  const now = options.now ?? new Date()
  const permit = parsePermit(input.permit)
  if (permit.version !== 2)
    throw new Error('unsupported execution permit version')
  if (permit.stationId !== user.stationId)
    throw new Error('permit station mismatch')
  if (permit.issuedTo !== user.id) throw new Error('permit user mismatch')
  if (permit.targetFingerprint !== expectedTarget)
    throw new Error('PSS target fingerprint mismatch')
  const issuedAtMs = new Date(permit.issuedAt).getTime()
  const expiresAtMs = new Date(permit.expiresAt).getTime()
  if (!Number.isFinite(issuedAtMs) || !Number.isFinite(expiresAtMs)) {
    throw new Error('execution permit timestamps are invalid')
  }
  if (issuedAtMs > now.getTime() + 5_000) {
    throw new Error('execution permit was issued in the future')
  }
  if (expiresAtMs <= now.getTime()) throw new Error('execution permit expired')
  if (
    !verifyDomsMaintenanceExecutionPermitSignature(
      permitPayload(permit),
      permit.signature,
      secret,
    )
  ) {
    throw new Error('execution permit signature is invalid')
  }

  const envelope = validateDomsMaintenanceEnvelope(input.envelope)
  if (envelope.name !== permit.commandName)
    throw new Error('permit command mismatch')
  const envelopeDigest = digestDomsMaintenanceValue(envelope)
  if (envelopeDigest !== permit.commandDigest)
    throw new Error('command envelope digest drift detected')

  const deps: Dependencies = {
    claimPermit:
      options.dependencies?.claimPermit ?? claimDomsMaintenanceExecutionPermit,
    completeClaim:
      options.dependencies?.completeClaim ??
      completeDomsMaintenanceExecutionClaim,
    sendEnvelope:
      options.dependencies?.sendEnvelope ?? sendDomsMaintenanceJplEnvelope,
    createAudit: options.dependencies?.createAudit ?? createAuditLog,
    recordEvent: options.dependencies?.recordEvent ?? recordForecourtEvent,
  }
  const permitId = permit.signature
  const claimed = await deps.claimPermit({
    permitId,
    stationId: permit.stationId,
    sessionId: permit.sessionId,
    commandName: permit.commandName,
    commandDigest: permit.commandDigest,
    userId: user.id,
    claimedAt: now.toISOString(),
  })
  if (!claimed) throw new Error('execution permit has already been consumed')

  try {
    const response = await deps.sendEnvelope(envelope as any)
    await deps.completeClaim({
      permitId,
      status: 'succeeded',
      response,
      completedAt: new Date().toISOString(),
    })
    const audit = await deps.createAudit({
      stationId: user.stationId,
      userId: user.id,
      action: 'DOMS_MAINTENANCE_COMMAND_EXECUTED',
      entityType: 'forecourt.domsMaintenanceExecution',
      entityId: permitId,
      newValues: {
        sessionId: permit.sessionId,
        commandName: permit.commandName,
        commandDigest: permit.commandDigest,
        targetFingerprint: permit.targetFingerprint,
        deploymentSignOffId: permit.deploymentSignOffId,
        acceptanceDigest: permit.acceptanceDigest,
        deploymentArtifact: permit.deploymentArtifact,
        response,
      },
      metadata: {
        source: 'doms-maintenance-command-execution',
        confirmationId: permit.confirmationId,
        deploymentSignOffId: permit.deploymentSignOffId,
        oneTimePermitConsumed: true,
      },
    })
    await deps.recordEvent({
      stationId: user.stationId,
      source: 'admin',
      eventType: 'doms.maintenance_command_executed',
      payload: {
        auditLogId: audit.id,
        permitId,
        sessionId: permit.sessionId,
        commandName: permit.commandName,
        userId: user.id,
      },
    })
    return {
      success: true,
      permitConsumed: true,
      auditLogId: audit.id,
      response,
    }
  } catch (error) {
    await deps.completeClaim({
      permitId,
      status: 'failed',
      error: error instanceof Error ? error.message : String(error),
      completedAt: new Date().toISOString(),
    })
    await deps.createAudit({
      stationId: user.stationId,
      userId: user.id,
      action: 'DOMS_MAINTENANCE_COMMAND_FAILED',
      entityType: 'forecourt.domsMaintenanceExecution',
      entityId: permitId,
      newValues: {
        sessionId: permit.sessionId,
        commandName: permit.commandName,
        commandDigest: permit.commandDigest,
      },
      metadata: {
        source: 'doms-maintenance-command-execution',
        oneTimePermitConsumed: true,
        error: error instanceof Error ? error.message : String(error),
      },
    })
    throw error
  }
}
