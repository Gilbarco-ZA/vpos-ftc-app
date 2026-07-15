import type { SessionUser } from '@/src/shared/types'

import { createAuditLog } from '@/src/platform/security/audit/audit-log.repository'
import { requireNonEmptyString } from '@/src/shared/utils/inputs'

import { saveDomsDeploymentSignOff } from '../infrastructure/domsDeploymentSignOffRepo'
import { recordForecourtEvent } from '../infrastructure/persistence'
import { buildDomsFirstSiteAcceptancePack } from './domsFirstSiteAcceptancePack'
import { getDomsFieldValidationReadiness } from './getDomsFieldValidationReadiness'

export type RecordDomsDeploymentSignOffInput = {
  acceptanceDigest?: unknown
  deploymentArtifact?: unknown
  pssTargetFingerprint?: unknown
  fieldEngineer?: unknown
  supportRepresentative?: unknown
  softwareOwner?: unknown
  deploymentOwner?: unknown
  decision?: unknown
  exceptions?: unknown
  confirmAcceptanceDefinitionReviewed?: unknown
  confirmAllBlockingCheckpointsPassed?: unknown
  confirmTargetPssVerified?: unknown
  confirmNoPssWrite?: unknown
}

const requireTrue = (value: unknown, field: string) => {
  if (value !== true) throw new Error(`${field} must be confirmed`)
}

const parseDecision = (value: unknown) => {
  const decision = String(value ?? '')
    .trim()
    .toLowerCase()
  if (decision !== 'approved' && decision !== 'rejected') {
    throw new Error('decision must be approved or rejected')
  }
  return decision as 'approved' | 'rejected'
}

const parseExceptions = (value: unknown) => {
  if (value == null) return []
  if (!Array.isArray(value)) throw new Error('exceptions must be an array')
  return value.slice(0, 25).map((entry, index) => {
    const text = requireNonEmptyString(entry, `exceptions[${index}]`)
    if (text.length > 500) throw new Error(`exceptions[${index}] is too long`)
    return text
  })
}

export const validateDomsDeploymentSignOff = (input: {
  request: RecordDomsDeploymentSignOffInput
  expectedAcceptanceDigest: string
  blockingItemCount: number
  productionReleaseStatus: string
}) => {
  const decision = parseDecision(input.request.decision)
  const acceptanceDigest = requireNonEmptyString(
    input.request.acceptanceDigest,
    'acceptanceDigest',
  )
  if (acceptanceDigest !== input.expectedAcceptanceDigest) {
    throw new Error(
      'acceptanceDigest does not match the current acceptance definition',
    )
  }

  requireTrue(
    input.request.confirmAcceptanceDefinitionReviewed,
    'confirmAcceptanceDefinitionReviewed',
  )
  requireTrue(input.request.confirmNoPssWrite, 'confirmNoPssWrite')

  if (decision === 'approved') {
    requireTrue(
      input.request.confirmAllBlockingCheckpointsPassed,
      'confirmAllBlockingCheckpointsPassed',
    )
    requireTrue(
      input.request.confirmTargetPssVerified,
      'confirmTargetPssVerified',
    )
    if (input.blockingItemCount !== 0) {
      throw new Error(
        `deployment cannot be approved while ${input.blockingItemCount} production-blocking checkpoint(s) remain`,
      )
    }
    if (input.productionReleaseStatus !== 'ready-for-final-review') {
      throw new Error(
        `deployment cannot be approved while production release status is '${input.productionReleaseStatus}'`,
      )
    }
  }

  const exceptions = parseExceptions(input.request.exceptions)
  if (decision === 'approved' && exceptions.length > 0) {
    throw new Error('approved sign-off cannot contain unresolved exceptions')
  }

  return {
    acceptanceDigest,
    deploymentArtifact: requireNonEmptyString(
      input.request.deploymentArtifact,
      'deploymentArtifact',
    ),
    pssTargetFingerprint: requireNonEmptyString(
      input.request.pssTargetFingerprint,
      'pssTargetFingerprint',
    ),
    fieldEngineer: requireNonEmptyString(
      input.request.fieldEngineer,
      'fieldEngineer',
    ),
    supportRepresentative: requireNonEmptyString(
      input.request.supportRepresentative,
      'supportRepresentative',
    ),
    softwareOwner: requireNonEmptyString(
      input.request.softwareOwner,
      'softwareOwner',
    ),
    deploymentOwner: requireNonEmptyString(
      input.request.deploymentOwner,
      'deploymentOwner',
    ),
    decision,
    exceptions,
  }
}

export const recordDomsDeploymentSignOff = async (
  request: RecordDomsDeploymentSignOffInput,
  user: SessionUser,
) => {
  const readiness = await getDomsFieldValidationReadiness(user.stationId)
  const pack = buildDomsFirstSiteAcceptancePack({
    stationId: user.stationId,
    readiness,
  })
  const signOff = validateDomsDeploymentSignOff({
    request,
    expectedAcceptanceDigest: pack.acceptanceDigest,
    blockingItemCount: readiness.summary.blockingItemCount,
    productionReleaseStatus: readiness.productionReleaseStatus,
  })
  const signedAt = new Date().toISOString()

  const audit = await createAuditLog({
    stationId: user.stationId,
    userId: user.id,
    action: 'DOMS_DEPLOYMENT_SIGN_OFF_RECORDED',
    entityType: 'forecourt.domsDeploymentSignOff',
    entityId: signOff.acceptanceDigest,
    newValues: {
      ...signOff,
      signedAt,
      readinessGeneratedAt: readiness.generatedAt,
      productionReleaseStatus: readiness.productionReleaseStatus,
      blockingItemCount: readiness.summary.blockingItemCount,
    },
    metadata: {
      recordedBy: user.username,
      confirmAcceptanceDefinitionReviewed: true,
      confirmAllBlockingCheckpointsPassed:
        request.confirmAllBlockingCheckpointsPassed === true,
      confirmTargetPssVerified: request.confirmTargetPssVerified === true,
      confirmNoPssWrite: true,
      safetyBoundary:
        'Deployment sign-off records an audited decision only. It does not send a DOMS/PSS command or enable a maintenance execution permit.',
    },
  })

  await saveDomsDeploymentSignOff({
    signOffId: audit.id,
    stationId: user.stationId,
    acceptanceDigest: signOff.acceptanceDigest,
    deploymentArtifact: signOff.deploymentArtifact,
    pssTargetFingerprint: signOff.pssTargetFingerprint,
    decision: signOff.decision,
    exceptions: signOff.exceptions,
    signedByUserId: user.id,
    signedAt,
    readinessGeneratedAt: readiness.generatedAt,
    productionReleaseStatus: readiness.productionReleaseStatus,
    blockingItemCount: readiness.summary.blockingItemCount,
  })

  await recordForecourtEvent({
    stationId: user.stationId,
    source: 'admin',
    eventType: 'doms.deployment_sign_off_recorded',
    payload: {
      auditLogId: audit.id,
      acceptanceDigest: signOff.acceptanceDigest,
      decision: signOff.decision,
      deploymentArtifact: signOff.deploymentArtifact,
      pssTargetFingerprint: signOff.pssTargetFingerprint,
      signedAt,
      userId: user.id,
    },
  })

  return {
    success: true,
    signOffId: audit.id,
    stationId: user.stationId,
    signedAt,
    ...signOff,
    productionReleaseStatus: readiness.productionReleaseStatus,
    blockingItemCount: readiness.summary.blockingItemCount,
    sendsDomsCommand: false,
  }
}
