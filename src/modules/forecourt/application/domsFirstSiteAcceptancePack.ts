import { createHash } from 'node:crypto'

import { requireNonEmptyString } from '@/src/shared/utils/inputs'

export type AcceptanceChecklistItem = {
  id: string
  area: string
  status: string
  title: string
  description: string
  blocksProduction: boolean
  manualValidationRequired: boolean
}

export type AcceptanceReadinessSnapshot = {
  generatedAt: string
  overallStatus: string
  productionReleaseStatus: string
  summary: {
    blockingItemCount: number
    checkpointCount: number
  }
  checklist: AcceptanceChecklistItem[]
}

export type DomsAcceptanceCriterion = {
  id: string
  area: string
  title: string
  acceptanceCondition: string
  requiredEvidence: string[]
  owner: 'field-engineering' | 'support' | 'software' | 'fiscalization'
  blocksGoLive: boolean
  sourceCheckpointId: string
}

const canonicalize = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(canonicalize)
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, canonicalize(entry)]),
    )
  }
  return value
}

const digestJson = (value: unknown) =>
  createHash('sha256')
    .update(JSON.stringify(canonicalize(value)))
    .digest('hex')

const ownerFor = (
  item: AcceptanceChecklistItem,
): DomsAcceptanceCriterion['owner'] => {
  if (item.area === 'tanzania-fiscalization') return 'fiscalization'
  if (item.area === 'build') return 'software'
  if (item.area === 'operations') return 'support'
  return 'field-engineering'
}

const evidenceFor = (item: AcceptanceChecklistItem) => {
  const common = [
    'Timestamped result recorded against the source checkpoint',
    'Operator or engineer note identifying the target site and PSS',
  ]

  if (item.area === 'jpl-hardware') {
    return [
      ...common,
      'Live-controller validation report or controlled test transcript',
      'PSS host, port, software version, and station identifier',
    ]
  }
  if (item.area === 'reconciliation') {
    return [
      ...common,
      'Reconciliation report compared with PSS Configurator output',
      'Explanation and approval for every remaining mismatch',
    ]
  }
  if (item.area === 'tanzania-fiscalization') {
    return [
      ...common,
      'Redacted TRA/EWURA request and response reference',
      'Fiscal receipt, counter, retry, and reconciliation evidence',
    ]
  }
  if (item.area === 'build') {
    return [
      ...common,
      'Build and test command output with commit or package identifier',
    ]
  }
  return common
}

export const buildDomsFirstSiteAcceptancePack = (input: {
  stationId: string
  readiness: AcceptanceReadinessSnapshot
  generatedAt?: string
}) => {
  const stationId = requireNonEmptyString(input.stationId, 'stationId')
  const generatedAt = input.generatedAt ?? new Date().toISOString()
  const criteria: DomsAcceptanceCriterion[] = input.readiness.checklist
    .filter((item) => item.blocksProduction || item.manualValidationRequired)
    .map((item) => ({
      id: `accept-${item.id}`,
      area: item.area,
      title: item.title,
      acceptanceCondition: `The checkpoint '${item.id}' is recorded as passed with site-specific evidence. ${item.description}`,
      requiredEvidence: evidenceFor(item),
      owner: ownerFor(item),
      blocksGoLive: item.blocksProduction,
      sourceCheckpointId: item.id,
    }))
    .sort((left, right) => left.id.localeCompare(right.id))

  const acceptanceDefinition = {
    stationId,
    criteria,
    mandatoryApprovals: [
      'Field engineer confirms physical PSS identity and live test results.',
      'Support confirms alarm, reconnect, stale-lock, and recovery runbooks were rehearsed.',
      'Software owner confirms build, automated tests, and release artifact identity.',
      'Deployment owner confirms all production-blocking checkpoints are passed.',
    ],
    goLiveRule:
      'Go-live is permitted only when every criterion marked blocksGoLive has a passed source checkpoint and the final deployment sign-off references this immutable acceptance digest.',
  }
  const acceptanceDigest = digestJson(acceptanceDefinition)

  return {
    success: true,
    exportType: 'doms-first-site-acceptance-pack',
    stationId,
    generatedAt,
    acceptanceDigest,
    safetyNotice:
      'This pack defines acceptance evidence only. It does not send DOMS/PSS commands, approve maintenance execution, or enable fiscalization cutover.',
    readinessSnapshot: {
      generatedAt: input.readiness.generatedAt,
      overallStatus: input.readiness.overallStatus,
      productionReleaseStatus: input.readiness.productionReleaseStatus,
      blockingItemCount: input.readiness.summary.blockingItemCount,
      checkpointCount: input.readiness.summary.checkpointCount,
    },
    acceptanceDefinition,
    signOffTemplate: {
      acceptanceDigest,
      deploymentArtifact: '',
      pssTargetFingerprint: '',
      fieldEngineer: '',
      supportRepresentative: '',
      softwareOwner: '',
      deploymentOwner: '',
      signedAt: '',
      decision: 'pending' as const,
      exceptions: [] as string[],
    },
  }
}
