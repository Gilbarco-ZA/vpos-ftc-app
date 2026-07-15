import { createHmac, timingSafeEqual } from 'node:crypto'
import type { SessionUser } from '@/src/shared/types'

import { findLatestApprovedDomsDeploymentSignOff } from '../infrastructure/domsDeploymentSignOffRepo'
import { buildDomsFirstSiteAcceptancePack } from './domsFirstSiteAcceptancePack'
import { getDomsFieldValidationReadiness } from './getDomsFieldValidationReadiness'

const MAX_RECONCILIATION_AGE_MS = 5 * 60 * 1000
const PERMIT_TTL_MS = 30 * 1000
const ALLOWED_COMMANDS = new Set([
  'install_Fp_req',
  'install_Tg_req',
  'install_Dispenser_req',
  'install_Pp_req',
  'clear_InstallData_req',
])

export type DomsMaintenanceExecutionPermitInput = {
  stationId?: unknown
  sessionId?: unknown
  commandName?: unknown
  commandDigest?: unknown
  comparisonDigest?: unknown
  confirmationId?: unknown
  confirmationExpiresAt?: unknown
  reconciliationObservedAt?: unknown
  sessionExpiresAt?: unknown
  targetFingerprint?: unknown
  confirmTargetFingerprint?: unknown
  confirmOneTimePermit?: unknown
  confirmKillSwitchReviewed?: unknown
}

type PermitEnvironment = {
  DOMS_PSS_WRITE_EXECUTION_ENABLED?: string
  DOMS_PSS_WRITE_KILL_SWITCH?: string
  DOMS_PSS_WRITE_PERMIT_SECRET?: string
}

type TrustedApproval = {
  signOffId: string
  acceptanceDigest: string
  deploymentArtifact: string
}

const text = (value: unknown, field: string) => {
  const result = String(value ?? '').trim()
  if (!result) throw new Error(`${field} is required`)
  return result
}

const date = (value: unknown, field: string) => {
  const result = new Date(text(value, field))
  if (!Number.isFinite(result.getTime())) throw new Error(`${field} is invalid`)
  return result
}

export function evaluateDomsMaintenanceExecutionPermit(
  input: DomsMaintenanceExecutionPermitInput,
  user: SessionUser,
  options: {
    env?: PermitEnvironment
    now?: Date
    trustedApproval?: TrustedApproval | null
    fieldValidationComplete?: boolean
  } = {},
) {
  const env = options.env ?? process.env
  const now = options.now ?? new Date()
  const stationId = text(input.stationId, 'stationId')
  const sessionId = text(input.sessionId, 'sessionId')
  const commandName = text(input.commandName, 'commandName')
  const commandDigest = text(input.commandDigest, 'commandDigest')
  const comparisonDigest = text(input.comparisonDigest, 'comparisonDigest')
  const confirmationId = text(input.confirmationId, 'confirmationId')
  const targetFingerprint = text(input.targetFingerprint, 'targetFingerprint')
  const confirmationExpiresAt = date(
    input.confirmationExpiresAt,
    'confirmationExpiresAt',
  )
  const reconciliationObservedAt = date(
    input.reconciliationObservedAt,
    'reconciliationObservedAt',
  )
  const sessionExpiresAt = date(input.sessionExpiresAt, 'sessionExpiresAt')

  const blockers: string[] = []
  if (user.role !== 'field_engineer')
    blockers.push('field_engineer role required')
  if (user.stationId !== stationId) blockers.push('station mismatch')
  if (!ALLOWED_COMMANDS.has(commandName))
    blockers.push('command is not allowlisted')
  if (commandDigest !== comparisonDigest)
    blockers.push('command digest drift detected')
  if (confirmationExpiresAt.getTime() <= now.getTime())
    blockers.push('final confirmation expired')
  if (sessionExpiresAt.getTime() <= now.getTime())
    blockers.push('maintenance session expired')
  if (
    now.getTime() - reconciliationObservedAt.getTime() >
    MAX_RECONCILIATION_AGE_MS
  ) {
    blockers.push('reconciliation snapshot is stale')
  }
  if (options.fieldValidationComplete !== true) {
    blockers.push('field validation evidence is incomplete')
  }
  if (!options.trustedApproval) {
    blockers.push('database-backed deployment sign-off is missing')
  }
  if (input.confirmTargetFingerprint !== true)
    blockers.push('target fingerprint not confirmed')
  if (input.confirmOneTimePermit !== true)
    blockers.push('one-time permit not confirmed')
  if (input.confirmKillSwitchReviewed !== true)
    blockers.push('kill switch not reviewed')

  const enabled = env.DOMS_PSS_WRITE_EXECUTION_ENABLED === 'true'
  const killSwitchActive = env.DOMS_PSS_WRITE_KILL_SWITCH !== 'false'
  const secret = env.DOMS_PSS_WRITE_PERMIT_SECRET ?? ''
  if (!enabled) blockers.push('PSS write execution feature flag is disabled')
  if (killSwitchActive) blockers.push('PSS write kill switch is active')
  if (secret.length < 32)
    blockers.push('permit signing secret is not configured securely')

  if (blockers.length) {
    return {
      allowed: false as const,
      sendsDomsCommand: false as const,
      stationId,
      sessionId,
      commandName,
      targetFingerprint,
      blockers,
    }
  }

  const approval = options.trustedApproval as TrustedApproval
  const issuedAt = now.toISOString()
  const expiresAt = new Date(now.getTime() + PERMIT_TTL_MS).toISOString()
  const payload = [
    stationId,
    sessionId,
    commandName,
    commandDigest,
    confirmationId,
    targetFingerprint,
    approval.signOffId,
    approval.acceptanceDigest,
    issuedAt,
    expiresAt,
    user.id,
  ].join('|')
  const signature = createHmac('sha256', secret).update(payload).digest('hex')

  return {
    allowed: true as const,
    sendsDomsCommand: false as const,
    permit: {
      version: 2,
      stationId,
      sessionId,
      commandName,
      commandDigest,
      confirmationId,
      targetFingerprint,
      deploymentSignOffId: approval.signOffId,
      acceptanceDigest: approval.acceptanceDigest,
      deploymentArtifact: approval.deploymentArtifact,
      issuedAt,
      expiresAt,
      issuedTo: user.id,
      signature,
    },
    safetyBoundary:
      'This permit authorizes only the separately guarded command adapter. This endpoint does not transmit a DOMS/PSS command.',
  }
}

export async function issueDomsMaintenanceExecutionPermit(
  input: DomsMaintenanceExecutionPermitInput,
  user: SessionUser,
  options: {
    env?: PermitEnvironment
    now?: Date
    getReadiness?: typeof getDomsFieldValidationReadiness
    findApprovedSignOff?: typeof findLatestApprovedDomsDeploymentSignOff
  } = {},
) {
  const stationId = text(input.stationId, 'stationId')
  const targetFingerprint = text(input.targetFingerprint, 'targetFingerprint')
  const getReadiness = options.getReadiness ?? getDomsFieldValidationReadiness
  const findApprovedSignOff =
    options.findApprovedSignOff ?? findLatestApprovedDomsDeploymentSignOff
  const readiness = await getReadiness(stationId)
  const pack = buildDomsFirstSiteAcceptancePack({ stationId, readiness })
  const fieldValidationComplete =
    readiness.summary.blockingItemCount === 0 &&
    readiness.productionReleaseStatus === 'ready-for-final-review'
  const trustedApproval = await findApprovedSignOff({
    stationId,
    acceptanceDigest: pack.acceptanceDigest,
    pssTargetFingerprint: targetFingerprint,
  })

  return evaluateDomsMaintenanceExecutionPermit(input, user, {
    env: options.env,
    now: options.now,
    fieldValidationComplete,
    trustedApproval,
  })
}

export function verifyDomsMaintenanceExecutionPermitSignature(
  payload: string,
  signature: string,
  secret: string,
) {
  const expected = createHmac('sha256', secret).update(payload).digest()
  const supplied = Buffer.from(signature, 'hex')
  return (
    supplied.length === expected.length && timingSafeEqual(supplied, expected)
  )
}
