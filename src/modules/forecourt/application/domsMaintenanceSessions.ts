import { createHash } from 'node:crypto'
import type { SessionUser } from '@/src/shared/types'

import { createAuditLog } from '@/src/platform/security/audit/audit-log.repository'
import { requireNonEmptyString, toPositiveInt } from '@/src/shared/utils/inputs'
import { uuidv4 } from '@/src/shared/utils/uuid'

import type { DomsMaintenanceSessionAuditRow } from '../infrastructure/domsMaintenanceSessionsRepo'
import {
  listDomsMaintenanceSessionAuditRows,
  listDomsMaintenanceSessionAuditRowsBySession,
} from '../infrastructure/domsMaintenanceSessionsRepo'
import { recordForecourtEvent } from '../infrastructure/persistence'
import { getDomsMaintenancePlan } from './getDomsMaintenancePlan'

type SessionStatus = 'requested' | 'approved' | 'cancelled' | 'expired'

type RequestSessionInput = {
  reason?: unknown
  requestedWindow?: unknown
  confirmationNote?: unknown
  confirmDryRunOnly?: unknown
  confirmNoDomsCommand?: unknown
  confirmPssConfiguratorChecked?: unknown
}

type ApproveSessionInput = {
  sessionId?: unknown
  approvalNote?: unknown
  confirmDryRunOnly?: unknown
  confirmNoDomsCommand?: unknown
  confirmPhysicalSiteChecked?: unknown
}

type CancelSessionInput = {
  sessionId?: unknown
  cancellationNote?: unknown
  confirmCancel?: unknown
}

export type DomsMaintenanceSessionMutationInput =
  | ({ action: 'request' } & RequestSessionInput)
  | ({ action: 'approve' } & ApproveSessionInput)
  | ({ action: 'cancel' } & CancelSessionInput)

const SESSION_TTL_HOURS = 4
const MAX_NOTE_LENGTH = 1000

const asRecord = (value: unknown): Record<string, unknown> => {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>
  }
  return {}
}

const toDate = (value: unknown) => {
  const date = new Date(String(value ?? ''))
  return Number.isFinite(date.getTime()) ? date : null
}

const parseOptionalNote = (value: unknown, fieldName: string) => {
  if (value == null) return null
  const normalized = String(value).trim()
  if (!normalized) return null
  if (normalized.length > MAX_NOTE_LENGTH) {
    throw new Error(
      `${fieldName} must be ${MAX_NOTE_LENGTH} characters or fewer`,
    )
  }
  return normalized
}

const parseRequiredNote = (value: unknown, fieldName: string) => {
  const normalized = requireNonEmptyString(value, fieldName)
  if (normalized.length > MAX_NOTE_LENGTH) {
    throw new Error(
      `${fieldName} must be ${MAX_NOTE_LENGTH} characters or fewer`,
    )
  }
  if (normalized.length < 10) {
    throw new Error(
      `${fieldName} must describe the maintenance reason in at least 10 characters`,
    )
  }
  return normalized
}

const requireTrue = (value: unknown, fieldName: string) => {
  if (value !== true) throw new Error(`${fieldName} must be confirmed`)
}

const planFingerprint = (plan: any) => {
  const hashPayload = {
    mode: plan?.mode,
    generatedAt: plan?.generatedAt,
    readiness: plan?.readiness,
    stepCounts: plan?.stepCounts,
    severityCounts: plan?.severityCounts,
    reconciliationSummary: plan?.reconciliationSummary,
  }
  return createHash('sha256').update(JSON.stringify(hashPayload)).digest('hex')
}

const summarizePlan = (plan: any) => ({
  mode: plan.mode,
  issueCount: plan.readiness?.issueCount ?? 0,
  suggestionCount: plan.readiness?.suggestionCount ?? 0,
  pssWriteCandidateCount: plan.readiness?.pssWriteCandidateCount ?? 0,
  unresolvedBlockingIssueCount:
    plan.readiness?.unresolvedBlockingIssueCount ?? 0,
  stepCounts: plan.stepCounts ?? {},
  severityCounts: plan.severityCounts ?? {},
  generatedAt: plan.generatedAt,
})

const sessionExpiresAt = (createdAt: Date) => {
  const expiresAt = new Date(createdAt)
  expiresAt.setHours(expiresAt.getHours() + SESSION_TTL_HOURS)
  return expiresAt
}

const formatActor = (row: DomsMaintenanceSessionAuditRow | null) => {
  if (!row) return null
  return {
    userId: row.user_id,
    username: row.username,
    userFullName: row.user_full_name,
  }
}

function deriveSession(rows: DomsMaintenanceSessionAuditRow[]) {
  if (!rows.length) return null

  const requested = rows.find(
    (row) => row.action === 'DOMS_MAINTENANCE_SESSION_REQUESTED',
  )
  if (!requested) return null

  const approved = rows.find(
    (row) => row.action === 'DOMS_MAINTENANCE_SESSION_APPROVED',
  )
  const cancelled = rows.find(
    (row) => row.action === 'DOMS_MAINTENANCE_SESSION_CANCELLED',
  )
  const requestedAt = toDate(requested.created_at) ?? new Date()
  const expiresAt = sessionExpiresAt(requestedAt)
  const isExpired = expiresAt.getTime() < Date.now()
  const status: SessionStatus = cancelled
    ? 'cancelled'
    : isExpired
      ? 'expired'
      : approved
        ? 'approved'
        : 'requested'
  const requestedMetadata = asRecord(requested.metadata)
  const approvedMetadata = asRecord(approved?.metadata)
  const cancelledMetadata = asRecord(cancelled?.metadata)

  return {
    id: requested.entity_id,
    stationId: requested.station_id,
    status,
    requestedAt: requested.created_at,
    approvedAt: approved?.created_at ?? null,
    cancelledAt: cancelled?.created_at ?? null,
    expiresAt: expiresAt.toISOString(),
    isExpired,
    requestedBy: formatActor(requested),
    approvedBy: formatActor(approved ?? null),
    cancelledBy: formatActor(cancelled ?? null),
    requestAuditLogId: requested.id,
    approvalAuditLogId: approved?.id ?? null,
    cancellationAuditLogId: cancelled?.id ?? null,
    reason: requestedMetadata.reason ?? null,
    requestedWindow: requestedMetadata.requestedWindow ?? null,
    requestConfirmationNote: requestedMetadata.confirmationNote ?? null,
    approvalNote: approvedMetadata.approvalNote ?? null,
    cancellationNote: cancelledMetadata.cancellationNote ?? null,
    planFingerprint: requestedMetadata.planFingerprint ?? null,
    planSummary: asRecord(requested.new_values),
    safetyBoundary:
      requestedMetadata.safetyBoundary ??
      'Maintenance session is an FTC approval gate only. No DOMS/PSS command is sent.',
    executionGate: {
      enabled: false,
      reason:
        'DOMS/PSS write execution remains disabled. Approval records maintenance intent only.',
      requiresSeparateImplementationPass: true,
    },
    auditTrail: rows.map((row) => ({
      id: row.id,
      action: row.action,
      actor: formatActor(row),
      metadata: asRecord(row.metadata),
      createdAt: row.created_at,
    })),
  }
}

const groupRowsBySession = (rows: DomsMaintenanceSessionAuditRow[]) => {
  const groups = new Map<string, DomsMaintenanceSessionAuditRow[]>()
  for (const row of rows) {
    const sessionId = String(row.entity_id ?? '')
    if (!sessionId) continue
    const group = groups.get(sessionId) ?? []
    group.push(row)
    groups.set(sessionId, group)
  }

  return Array.from(groups.values())
    .map((group) =>
      deriveSession(
        group.slice().sort((a, b) => {
          const left = toDate(a.created_at)?.getTime() ?? 0
          const right = toDate(b.created_at)?.getTime() ?? 0
          return left - right
        }),
      ),
    )
    .filter(Boolean)
}

export async function listDomsMaintenanceSessions(
  stationId: string,
  searchParams: URLSearchParams,
) {
  const normalizedStationId = requireNonEmptyString(stationId, 'stationId')
  const limit = toPositiveInt(searchParams.get('limit'), 20, 100)
  const rows = await listDomsMaintenanceSessionAuditRows({
    stationId: normalizedStationId,
    limit: Math.max(limit * 3, 30),
  })
  const sessions = groupRowsBySession(rows).slice(0, limit)

  return {
    success: true,
    data: {
      stationId: normalizedStationId,
      generatedAt: new Date().toISOString(),
      executionGate: {
        enabled: false,
        reason:
          'This endpoint records maintenance approval state only. DOMS/PSS write execution is not implemented or enabled.',
      },
      sessionTtlHours: SESSION_TTL_HOURS,
      sessions,
      activeSession:
        sessions.find((session: any) => session.status === 'approved') ?? null,
      pendingSession:
        sessions.find((session: any) => session.status === 'requested') ?? null,
      safetyNotice:
        'Maintenance sessions are FTC-side approval/audit records only. They do not send DOMS install, clear-install, or configuration write commands.',
    },
  }
}

async function getSessionOrThrow(stationId: string, sessionId: string) {
  const rows = await listDomsMaintenanceSessionAuditRowsBySession({
    stationId,
    sessionId,
  })
  const session = deriveSession(rows)
  if (!session) throw new Error('Maintenance session was not found')
  return session
}

export async function requestDomsMaintenanceSession(
  input: RequestSessionInput,
  user: SessionUser,
) {
  requireTrue(input.confirmDryRunOnly, 'confirmDryRunOnly')
  requireTrue(input.confirmNoDomsCommand, 'confirmNoDomsCommand')
  requireTrue(
    input.confirmPssConfiguratorChecked,
    'confirmPssConfiguratorChecked',
  )

  const reason = parseRequiredNote(input.reason, 'reason')
  const requestedWindow = parseOptionalNote(
    input.requestedWindow,
    'requestedWindow',
  )
  const confirmationNote = parseOptionalNote(
    input.confirmationNote,
    'confirmationNote',
  )
  const existingRows = await listDomsMaintenanceSessionAuditRows({
    stationId: user.stationId,
    limit: 60,
  })
  const openSession = groupRowsBySession(existingRows).find(
    (session: any) =>
      session?.status === 'requested' || session?.status === 'approved',
  )
  if (openSession) {
    throw new Error(
      `A ${openSession.status} maintenance session already exists. Cancel it before requesting a new one.`,
    )
  }

  const plan = await getDomsMaintenancePlan(user.stationId)
  const sessionId = uuidv4()
  const now = new Date()
  const expiresAt = sessionExpiresAt(now)
  const fingerprint = planFingerprint(plan)
  const planSummary = summarizePlan(plan)

  const audit = await createAuditLog({
    stationId: user.stationId,
    userId: user.id,
    action: 'DOMS_MAINTENANCE_SESSION_REQUESTED',
    entityType: 'forecourt.domsMaintenanceSession',
    entityId: sessionId,
    newValues: planSummary,
    metadata: {
      source: 'doms-maintenance-session',
      reason,
      requestedWindow,
      confirmationNote,
      planFingerprint: fingerprint,
      expiresAt: expiresAt.toISOString(),
      safetyBoundary: plan.safetyBoundary,
      executionEnabled: false,
      sendsDomsCommand: false,
    },
  })

  await recordForecourtEvent({
    stationId: user.stationId,
    source: 'admin',
    eventType: 'doms.maintenance_session_requested',
    payload: {
      sessionId,
      auditLogId: audit.id,
      userId: user.id,
      username: user.username,
      reason,
      requestedWindow,
      confirmationNote,
      planSummary,
      planFingerprint: fingerprint,
      expiresAt: expiresAt.toISOString(),
      sendsDomsCommand: false,
    },
  })

  const session = await getSessionOrThrow(user.stationId, sessionId)
  return { session, auditLogId: audit.id }
}

export async function approveDomsMaintenanceSession(
  input: ApproveSessionInput,
  user: SessionUser,
) {
  requireTrue(input.confirmDryRunOnly, 'confirmDryRunOnly')
  requireTrue(input.confirmNoDomsCommand, 'confirmNoDomsCommand')
  requireTrue(input.confirmPhysicalSiteChecked, 'confirmPhysicalSiteChecked')

  const sessionId = requireNonEmptyString(input.sessionId, 'sessionId')
  const approvalNote = parseRequiredNote(input.approvalNote, 'approvalNote')
  const session = await getSessionOrThrow(user.stationId, sessionId)

  if (session.status !== 'requested') {
    throw new Error(
      `Only requested sessions can be approved; current status is ${session.status}`,
    )
  }
  if (session.isExpired) {
    throw new Error(
      'Maintenance session has expired. Create a new session from the latest plan.',
    )
  }

  const audit = await createAuditLog({
    stationId: user.stationId,
    userId: user.id,
    action: 'DOMS_MAINTENANCE_SESSION_APPROVED',
    entityType: 'forecourt.domsMaintenanceSession',
    entityId: sessionId,
    oldValues: {
      status: session.status,
      requestAuditLogId: session.requestAuditLogId,
    },
    newValues: {
      status: 'approved',
      approvedAt: new Date().toISOString(),
      planFingerprint: session.planFingerprint,
    },
    metadata: {
      source: 'doms-maintenance-session',
      approvalNote,
      requestAuditLogId: session.requestAuditLogId,
      safetyBoundary: session.safetyBoundary,
      executionEnabled: false,
      sendsDomsCommand: false,
    },
  })

  await recordForecourtEvent({
    stationId: user.stationId,
    source: 'admin',
    eventType: 'doms.maintenance_session_approved',
    payload: {
      sessionId,
      auditLogId: audit.id,
      requestAuditLogId: session.requestAuditLogId,
      userId: user.id,
      username: user.username,
      approvalNote,
      planFingerprint: session.planFingerprint,
      sendsDomsCommand: false,
    },
  })

  return {
    session: await getSessionOrThrow(user.stationId, sessionId),
    auditLogId: audit.id,
  }
}

export async function cancelDomsMaintenanceSession(
  input: CancelSessionInput,
  user: SessionUser,
) {
  requireTrue(input.confirmCancel, 'confirmCancel')

  const sessionId = requireNonEmptyString(input.sessionId, 'sessionId')
  const cancellationNote = parseRequiredNote(
    input.cancellationNote,
    'cancellationNote',
  )
  const session = await getSessionOrThrow(user.stationId, sessionId)

  if (session.status === 'cancelled') {
    throw new Error('Maintenance session is already cancelled')
  }

  const audit = await createAuditLog({
    stationId: user.stationId,
    userId: user.id,
    action: 'DOMS_MAINTENANCE_SESSION_CANCELLED',
    entityType: 'forecourt.domsMaintenanceSession',
    entityId: sessionId,
    oldValues: { status: session.status },
    newValues: {
      status: 'cancelled',
      cancelledAt: new Date().toISOString(),
    },
    metadata: {
      source: 'doms-maintenance-session',
      cancellationNote,
      requestAuditLogId: session.requestAuditLogId,
      approvalAuditLogId: session.approvalAuditLogId,
      safetyBoundary: session.safetyBoundary,
      executionEnabled: false,
      sendsDomsCommand: false,
    },
  })

  await recordForecourtEvent({
    stationId: user.stationId,
    source: 'admin',
    eventType: 'doms.maintenance_session_cancelled',
    payload: {
      sessionId,
      auditLogId: audit.id,
      userId: user.id,
      username: user.username,
      cancellationNote,
      previousStatus: session.status,
      sendsDomsCommand: false,
    },
  })

  return {
    session: await getSessionOrThrow(user.stationId, sessionId),
    auditLogId: audit.id,
  }
}

export async function requireApprovedDomsMaintenanceSession(params: {
  stationId: string
  sessionId: string
}) {
  const stationId = requireNonEmptyString(params.stationId, 'stationId')
  const sessionId = requireNonEmptyString(params.sessionId, 'sessionId')
  const session = await getSessionOrThrow(stationId, sessionId)

  if (session.status !== 'approved') {
    throw new Error(
      `An approved maintenance session is required; current status is ${session.status}`,
    )
  }
  if (session.isExpired) {
    throw new Error(
      'Maintenance session has expired. Request and approve a new session.',
    )
  }

  return session
}

export async function mutateDomsMaintenanceSession(
  input: DomsMaintenanceSessionMutationInput,
  user: SessionUser,
) {
  switch (input.action) {
    case 'request':
      return await requestDomsMaintenanceSession(input, user)
    case 'approve':
      return await approveDomsMaintenanceSession(input, user)
    case 'cancel':
      return await cancelDomsMaintenanceSession(input, user)
    default:
      throw new Error('Unsupported maintenance session action')
  }
}
