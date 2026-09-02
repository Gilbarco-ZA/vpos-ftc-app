import type { PoolClient } from '@/src/platform/db/postgres'
import type { StorageRetentionPolicy } from '@/src/platform/retention/storageRetentionPolicy'
import type { StorageRetentionTarget } from '@/src/platform/retention/storageRetentionTargets'

import { txQuery, withTransaction } from '@/src/platform/db/postgres'
import { pruneConfigVersionHistory } from '@/src/platform/retention/configVersionRetention'
import { compactForecourtPayloads } from '@/src/platform/retention/forecourtPayloadRetention'
import { getStorageRetentionPolicy } from '@/src/platform/retention/storageRetentionPolicy'
import { buildStorageRetentionTargets } from '@/src/platform/retention/storageRetentionTargets'
import { logger } from '@/src/shared/utils/logger'

const STORAGE_RETENTION_LOCK = 'retention:station-storage'

export type StorageRetentionTargetResult = {
  key: string
  retentionDays: number
  examined: number
  deleted: number
  compacted: number
  skipped: number
  batches: number
  oldestRemaining: string | null
  durationMs: number
  error: string | null
}

export type StorageRetentionRunResult = {
  locked: boolean
  dryRun: boolean
  examined: number
  deleted: number
  compacted: number
  skipped: number
  durationMs: number
  targets: StorageRetentionTargetResult[]
  forecourtCompaction: Awaited<ReturnType<typeof compactForecourtPayloads>>
}

function serializeTimestamp(value: Date | string | null | undefined) {
  if (value instanceof Date) return value.toISOString()
  return value == null ? null : String(value)
}

function candidateSql(target: StorageRetentionTarget, dryRun: boolean) {
  const selectLock = dryRun ? '' : `FOR UPDATE OF ${target.alias} SKIP LOCKED`
  const candidateSelectSql =
    target.candidateSelectSql ??
    `${target.alias}.${target.idColumn} AS candidate_id`
  const candidateOrderSql =
    target.candidateOrderSql ??
    `${target.timestampSql}, ${target.alias}.${target.idColumn}`
  const deleteMatchSql =
    target.deleteMatchSql ??
    `target.${target.idColumn} = candidates.candidate_id`
  const returningSql = target.returningSql ?? `target.${target.idColumn} AS id`
  const action = dryRun
    ? `SELECT * FROM candidates`
    : `DELETE FROM ${target.table} AS target
         USING candidates
        WHERE ${deleteMatchSql}
        RETURNING ${returningSql}`

  return `WITH candidates AS (
    SELECT ${candidateSelectSql}
      FROM ${target.table} AS ${target.alias}
     WHERE ${target.stationPredicateSql}
       AND ${target.eligibilitySql}
       AND ${target.timestampSql} < NOW() - ($2 * INTERVAL '1 day')
     ORDER BY ${candidateOrderSql}
     LIMIT $3
     ${selectLock}
  )
  ${action}`
}

async function oldestRemaining(
  client: PoolClient,
  stationId: string,
  target: StorageRetentionTarget,
) {
  const result = await txQuery<{ oldest_remaining: Date | string | null }>(
    client,
    `SELECT MIN(${target.timestampSql}) AS oldest_remaining
       FROM ${target.table} AS ${target.alias}
      WHERE ${target.stationPredicateSql}
        AND ${target.eligibilitySql}`,
    [stationId],
  )
  return serializeTimestamp(result.rows[0]?.oldest_remaining)
}

async function pruneTarget(
  client: PoolClient,
  stationId: string,
  target: StorageRetentionTarget,
  policy: StorageRetentionPolicy,
): Promise<StorageRetentionTargetResult> {
  const startedAt = Date.now()
  await txQuery(client, 'SAVEPOINT storage_retention_target')
  let examined = 0
  let deleted = 0
  let batches = 0

  if (target.retentionDays <= 0) {
    await txQuery(client, 'RELEASE SAVEPOINT storage_retention_target')
    return {
      key: target.key,
      retentionDays: target.retentionDays,
      examined: 0,
      deleted: 0,
      compacted: 0,
      skipped: 0,
      batches: 0,
      oldestRemaining: null,
      durationMs: Date.now() - startedAt,
      error: null,
    }
  }

  try {
    for (let index = 0; index < policy.maxBatches; index += 1) {
      const result = await txQuery<{ id: string | number }>(
        client,
        candidateSql(target, policy.dryRun),
        [stationId, target.retentionDays, policy.batchSize],
      )
      const candidateCount = result.rowCount ?? result.rows.length
      examined += candidateCount
      if (!policy.dryRun) deleted += candidateCount
      if (candidateCount > 0) batches += 1
      if (candidateCount < policy.batchSize || policy.dryRun) break
    }

    const result = {
      key: target.key,
      retentionDays: target.retentionDays,
      examined,
      deleted,
      compacted: 0,
      skipped: policy.dryRun ? examined : 0,
      batches,
      oldestRemaining: await oldestRemaining(client, stationId, target),
      durationMs: Date.now() - startedAt,
      error: null,
    }
    await txQuery(client, 'RELEASE SAVEPOINT storage_retention_target')
    return result
  } catch (error) {
    await txQuery(client, 'ROLLBACK TO SAVEPOINT storage_retention_target')
    await txQuery(client, 'RELEASE SAVEPOINT storage_retention_target')
    return {
      key: target.key,
      retentionDays: target.retentionDays,
      examined,
      deleted,
      compacted: 0,
      skipped: policy.dryRun ? examined : 0,
      batches,
      oldestRemaining: null,
      durationMs: Date.now() - startedAt,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

async function pruneExpiredSessions(
  client: PoolClient,
  stationId: string,
  policy: StorageRetentionPolicy,
): Promise<StorageRetentionTargetResult> {
  const startedAt = Date.now()
  await txQuery(client, 'SAVEPOINT storage_retention_sessions')
  let examined = 0
  let deleted = 0
  let batches = 0

  try {
    for (let index = 0; index < policy.maxBatches; index += 1) {
      const action = policy.dryRun
        ? 'SELECT candidate_id AS id FROM candidates'
        : `DELETE FROM sessions AS target
             USING candidates
            WHERE target.id = candidates.candidate_id
            RETURNING target.id`
      const lock = policy.dryRun ? '' : 'FOR UPDATE OF s SKIP LOCKED'
      const result = await txQuery<{ id: string }>(
        client,
        `WITH candidates AS (
          SELECT s.id AS candidate_id
            FROM sessions AS s
            JOIN users AS app_user ON app_user.id = s.user_id
           WHERE app_user.station_id::text = $1::text
             AND s.expires_at <= NOW()
           ORDER BY s.expires_at, s.id
           LIMIT $2
           ${lock}
        )
        ${action}`,
        [stationId, policy.batchSize],
      )
      const candidateCount = result.rowCount ?? result.rows.length
      examined += candidateCount
      if (!policy.dryRun) deleted += candidateCount
      if (candidateCount > 0) batches += 1
      if (candidateCount < policy.batchSize || policy.dryRun) break
    }

    const oldest = await txQuery<{ oldest_remaining: Date | string | null }>(
      client,
      `SELECT MIN(s.expires_at) AS oldest_remaining
         FROM sessions AS s
         JOIN users AS app_user ON app_user.id = s.user_id
        WHERE app_user.station_id::text = $1::text
          AND s.expires_at <= NOW()`,
      [stationId],
    )

    const result = {
      key: 'expired_sessions',
      retentionDays: 0,
      examined,
      deleted,
      compacted: 0,
      skipped: policy.dryRun ? examined : 0,
      batches,
      oldestRemaining: serializeTimestamp(oldest.rows[0]?.oldest_remaining),
      durationMs: Date.now() - startedAt,
      error: null,
    }
    await txQuery(client, 'RELEASE SAVEPOINT storage_retention_sessions')
    return result
  } catch (error) {
    await txQuery(client, 'ROLLBACK TO SAVEPOINT storage_retention_sessions')
    await txQuery(client, 'RELEASE SAVEPOINT storage_retention_sessions')
    return {
      key: 'expired_sessions',
      retentionDays: 0,
      examined,
      deleted,
      compacted: 0,
      skipped: policy.dryRun ? examined : 0,
      batches,
      oldestRemaining: null,
      durationMs: Date.now() - startedAt,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

export async function runStorageRetention(input: {
  stationId: string
  policy?: StorageRetentionPolicy
  targetKeys?: string[]
}): Promise<StorageRetentionRunResult> {
  const startedAt = Date.now()
  const stationId = String(input.stationId || '').trim()
  if (!stationId) throw new Error('stationId is required for storage retention')
  const policy = input.policy ?? getStorageRetentionPolicy()

  return await withTransaction(async (client) => {
    const lockResult = await txQuery<{ locked: boolean }>(
      client,
      `SELECT pg_try_advisory_xact_lock(hashtext($1), hashtext($2)) AS locked`,
      [STORAGE_RETENTION_LOCK, stationId],
    )
    const locked = Boolean(lockResult.rows[0]?.locked)
    if (!locked) {
      return {
        locked: false,
        dryRun: policy.dryRun,
        examined: 0,
        deleted: 0,
        compacted: 0,
        skipped: 0,
        durationMs: Date.now() - startedAt,
        targets: [],
        forecourtCompaction: [],
      }
    }

    await txQuery(client, `SET LOCAL lock_timeout = '2s'`)
    await txQuery(client, `SET LOCAL statement_timeout = '30s'`)

    const selectedKeys = input.targetKeys?.length
      ? new Set(input.targetKeys)
      : null
    const targets: StorageRetentionTargetResult[] = []
    for (const target of buildStorageRetentionTargets(policy)) {
      if (selectedKeys && !selectedKeys.has(target.key)) continue
      targets.push(await pruneTarget(client, stationId, target, policy))
    }
    if (!selectedKeys || selectedKeys.has('expired_sessions')) {
      targets.push(await pruneExpiredSessions(client, stationId, policy))
    }
    targets.push(
      ...(await pruneConfigVersionHistory({
        client,
        stationId,
        policy,
        targetKeys: selectedKeys,
      })),
    )

    const forecourtCompaction =
      !selectedKeys || selectedKeys.has('forecourt_payloads')
        ? await compactForecourtPayloads({ client, stationId, policy })
        : []

    return {
      locked: true,
      dryRun: policy.dryRun,
      examined:
        targets.reduce((sum, target) => sum + target.examined, 0) +
        forecourtCompaction.reduce((sum, target) => sum + target.examined, 0),
      deleted: targets.reduce((sum, target) => sum + target.deleted, 0),
      compacted: forecourtCompaction.reduce(
        (sum, target) => sum + target.compacted,
        0,
      ),
      skipped:
        targets.reduce((sum, target) => sum + target.skipped, 0) +
        forecourtCompaction.reduce((sum, target) => sum + target.skipped, 0),
      durationMs: Date.now() - startedAt,
      targets,
      forecourtCompaction,
    }
  })
}

let retentionStarted = false
let retentionTimer: NodeJS.Timeout | null = null
let retentionStopHandle: { stop: () => void } | null = null

export function startStorageRetentionWorker(stationId: string) {
  if (retentionStarted && retentionStopHandle) return retentionStopHandle
  retentionStarted = true

  const stop = () => {
    if (retentionTimer) clearInterval(retentionTimer)
    retentionTimer = null
    retentionStarted = false
    retentionStopHandle = null
  }
  retentionStopHandle = { stop }

  const policy = getStorageRetentionPolicy()
  if (!policy.enabled) {
    logger.info('[storageRetention]', {
      msg: 'Storage retention worker disabled',
      dryRun: policy.dryRun,
    })
    return retentionStopHandle
  }

  const run = async () => {
    try {
      const result = await runStorageRetention({ stationId, policy })
      logger.info('[storageRetention]', {
        stationId,
        locked: result.locked,
        dryRun: result.dryRun,
        examined: result.examined,
        deleted: result.deleted,
        compacted: result.compacted,
        skipped: result.skipped,
        durationMs: result.durationMs,
        targets: result.targets,
        forecourtCompaction: result.forecourtCompaction,
      })
    } catch (error) {
      logger.error('[storageRetention]', {
        msg: 'Storage retention run failed',
        stationId,
        dryRun: policy.dryRun,
        error,
      })
    }
  }

  void run()
  retentionTimer = setInterval(() => void run(), policy.cleanupIntervalMs)
  retentionTimer.unref?.()
  return retentionStopHandle
}
