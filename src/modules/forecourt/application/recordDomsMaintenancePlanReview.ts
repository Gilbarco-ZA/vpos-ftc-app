import type { SessionUser } from '@/src/shared/types'

import { createAuditLog } from '@/src/platform/security/audit/audit-log.repository'

import { recordForecourtEvent } from '../infrastructure/persistence'
import { getDomsMaintenancePlan } from './getDomsMaintenancePlan'

export type RecordDomsMaintenancePlanReviewInput = {
  confirmDryRunOnly?: unknown
  confirmationNote?: unknown
}

const parseConfirmationNote = (value: unknown) => {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed ? trimmed.slice(0, 1000) : null
}

export async function recordDomsMaintenancePlanReview(
  input: RecordDomsMaintenancePlanReviewInput,
  user: SessionUser,
) {
  if (input.confirmDryRunOnly !== true) {
    throw new Error(
      'confirmDryRunOnly must be true to record that this is a dry-run review only',
    )
  }

  const plan = await getDomsMaintenancePlan(user.stationId)
  const confirmationNote = parseConfirmationNote(input.confirmationNote)
  const summary = {
    mode: plan.mode,
    issueCount: plan.readiness.issueCount,
    suggestionCount: plan.readiness.suggestionCount,
    pssWriteCandidateCount: plan.readiness.pssWriteCandidateCount,
    unresolvedBlockingIssueCount: plan.readiness.unresolvedBlockingIssueCount,
    stepCounts: plan.stepCounts,
    severityCounts: plan.severityCounts,
  }

  const audit = await createAuditLog({
    stationId: user.stationId,
    userId: user.id,
    action: 'DOMS_MAINTENANCE_PLAN_REVIEWED',
    entityType: 'forecourt.domsMaintenancePlan',
    entityId: `${user.stationId}:${plan.generatedAt}`,
    newValues: summary,
    metadata: {
      source: 'doms-maintenance-plan',
      confirmationNote,
      safetyBoundary: plan.safetyBoundary,
      maintenanceMode: plan.maintenanceMode,
    },
  })

  await recordForecourtEvent({
    stationId: user.stationId,
    source: 'admin',
    eventType: 'doms.maintenance_plan_reviewed',
    payload: {
      userId: user.id,
      username: user.username,
      confirmationNote,
      summary,
      safetyBoundary: plan.safetyBoundary,
      auditLogId: audit.id,
    },
  })

  return { plan, auditLogId: audit.id }
}
