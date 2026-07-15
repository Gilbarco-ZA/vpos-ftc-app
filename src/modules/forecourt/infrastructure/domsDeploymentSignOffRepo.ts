import { query } from '@/src/platform/db/postgres'

export type DomsDeploymentSignOffRecord = {
  signOffId: string
  stationId: string
  acceptanceDigest: string
  deploymentArtifact: string
  pssTargetFingerprint: string
  decision: 'approved' | 'rejected'
  exceptions: string[]
  signedByUserId: string
  signedAt: string
  readinessGeneratedAt: string
  productionReleaseStatus: string
  blockingItemCount: number
}

export async function saveDomsDeploymentSignOff(
  record: DomsDeploymentSignOffRecord,
) {
  await query(
    `INSERT INTO forecourt_doms_deployment_sign_offs (
      sign_off_id, station_id, acceptance_digest, deployment_artifact,
      pss_target_fingerprint, decision, exceptions, signed_by_user_id,
      signed_at, readiness_generated_at, production_release_status,
      blocking_item_count
    ) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, $10, $11, $12)`,
    [
      record.signOffId,
      record.stationId,
      record.acceptanceDigest,
      record.deploymentArtifact,
      record.pssTargetFingerprint,
      record.decision,
      JSON.stringify(record.exceptions),
      record.signedByUserId,
      record.signedAt,
      record.readinessGeneratedAt,
      record.productionReleaseStatus,
      record.blockingItemCount,
    ],
  )
}

export async function findLatestApprovedDomsDeploymentSignOff(params: {
  stationId: string
  acceptanceDigest: string
  pssTargetFingerprint: string
}) {
  const result = await query<{
    sign_off_id: string
    acceptance_digest: string
    deployment_artifact: string
    pss_target_fingerprint: string
    signed_at: string
  }>(
    `SELECT sign_off_id, acceptance_digest, deployment_artifact,
            pss_target_fingerprint, signed_at
     FROM forecourt_doms_deployment_sign_offs
     WHERE station_id = $1
       AND acceptance_digest = $2
       AND pss_target_fingerprint = $3
       AND decision = 'approved'
       AND blocking_item_count = 0
       AND production_release_status = 'ready-for-final-review'
     ORDER BY signed_at DESC
     LIMIT 1`,
    [params.stationId, params.acceptanceDigest, params.pssTargetFingerprint],
  )
  const row = result.rows[0]
  if (!row) return null
  return {
    signOffId: row.sign_off_id,
    acceptanceDigest: row.acceptance_digest,
    deploymentArtifact: row.deployment_artifact,
    pssTargetFingerprint: row.pss_target_fingerprint,
    signedAt: new Date(row.signed_at).toISOString(),
  }
}
