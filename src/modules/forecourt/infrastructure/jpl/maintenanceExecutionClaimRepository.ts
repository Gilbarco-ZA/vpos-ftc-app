import { query } from '@/src/platform/db/postgres'

export type DomsMaintenanceExecutionClaim = {
  permitId: string
  stationId: string
  sessionId: string
  commandName: string
  commandDigest: string
  userId: string
  claimedAt: string
}

export async function claimDomsMaintenanceExecutionPermit(
  claim: DomsMaintenanceExecutionClaim,
) {
  const result = await query<{ permit_id: string }>(
    `INSERT INTO forecourt_doms_maintenance_execution_claims (
      permit_id, station_id, session_id, command_name, command_digest,
      user_id, status, claimed_at
    ) VALUES ($1, $2, $3, $4, $5, $6, 'claimed', $7)
    ON CONFLICT (permit_id) DO NOTHING
    RETURNING permit_id`,
    [
      claim.permitId,
      claim.stationId,
      claim.sessionId,
      claim.commandName,
      claim.commandDigest,
      claim.userId,
      claim.claimedAt,
    ],
  )
  return result.rowCount === 1
}

export async function completeDomsMaintenanceExecutionClaim(params: {
  permitId: string
  status: 'succeeded' | 'failed'
  response?: unknown
  error?: unknown
  completedAt: string
}) {
  await query(
    `UPDATE forecourt_doms_maintenance_execution_claims
     SET status = $2,
         response = $3,
         error_text = $4,
         completed_at = $5
     WHERE permit_id = $1`,
    [
      params.permitId,
      params.status,
      params.response ? JSON.stringify(params.response) : null,
      params.error ? String(params.error) : null,
      params.completedAt,
    ],
  )
}
