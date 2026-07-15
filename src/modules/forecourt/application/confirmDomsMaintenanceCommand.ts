import { createHash } from 'node:crypto'
import type { SessionUser } from '@/src/shared/types'

import { createAuditLog } from '@/src/platform/security/audit/audit-log.repository'

import type {
  DomsMaintenanceFinalConfirmation,
  DomsMaintenanceFinalConfirmationInput,
} from './confirmDomsMaintenanceCommand.types'
import { recordForecourtEvent } from '../infrastructure/persistence'
import { validateDomsMaintenanceFinalConfirmation } from './confirmDomsMaintenanceCommand.validation'
import { getDomsMaintenanceExecutionPolicy } from './domsMaintenanceExecutionPolicy'

const CONFIRMATION_TTL_SECONDS = 60

export async function recordDomsMaintenanceFinalConfirmation(
  input: DomsMaintenanceFinalConfirmationInput,
  user: SessionUser,
) {
  const validated = validateDomsMaintenanceFinalConfirmation(input, user)
  const policy = await getDomsMaintenanceExecutionPolicy(user.stationId)
  const confirmedAt = new Date()
  const expiresAt = new Date(
    confirmedAt.getTime() + CONFIRMATION_TTL_SECONDS * 1000,
  )
  const confirmationId = createHash('sha256')
    .update(
      [
        validated.stationId,
        validated.sessionId,
        validated.commandName,
        validated.commandDigest,
        user.id,
        confirmedAt.toISOString(),
      ].join(':'),
    )
    .digest('hex')

  const audit = await createAuditLog({
    stationId: user.stationId,
    userId: user.id,
    action: 'DOMS_MAINTENANCE_FINAL_CONFIRMATION_RECORDED',
    entityType: 'forecourt.domsMaintenanceFinalConfirmation',
    entityId: confirmationId,
    newValues: {
      sessionId: validated.sessionId,
      commandName: validated.commandName,
      commandDigest: validated.commandDigest,
      comparisonDigest: validated.comparisonDigest,
      roleRequirement: validated.roleRequirement,
      expiresAt: expiresAt.toISOString(),
      executionEnabled: false,
      sendsDomsCommand: false,
    },
    metadata: {
      source: 'doms-maintenance-final-confirmation',
      operatorNote: validated.operatorNote,
      policyMode: policy.mode,
      hardDisabled: policy.hardDisabled,
      safetyBoundary: validated.safetyBoundary,
    },
  })

  await recordForecourtEvent({
    stationId: user.stationId,
    source: 'admin',
    eventType: 'doms.maintenance_final_confirmation_recorded',
    payload: {
      confirmationId,
      auditLogId: audit.id,
      sessionId: validated.sessionId,
      commandName: validated.commandName,
      commandDigest: validated.commandDigest,
      userId: user.id,
      username: user.username,
      role: user.role,
      expiresAt: expiresAt.toISOString(),
      executionEnabled: false,
      sendsDomsCommand: false,
    },
  })

  const confirmation: DomsMaintenanceFinalConfirmation = {
    confirmationId,
    stationId: validated.stationId,
    sessionId: validated.sessionId,
    commandName: validated.commandName,
    commandDigest: validated.commandDigest,
    comparisonDigest: validated.comparisonDigest,
    confirmedAt: confirmedAt.toISOString(),
    confirmedBy: validated.confirmedBy,
    roleRequirement: validated.roleRequirement,
    executionEnabled: false,
    sendsDomsCommand: false,
    expiresAt: expiresAt.toISOString(),
    safetyBoundary: validated.safetyBoundary,
  }

  return {
    success: true,
    auditLogId: audit.id,
    policy,
    confirmation,
  }
}
