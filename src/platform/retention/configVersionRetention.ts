import type { PoolClient } from '@/src/platform/db/postgres'
import type { StorageRetentionTargetResult } from '@/src/platform/retention/storageRetention'
import type { StorageRetentionPolicy } from '@/src/platform/retention/storageRetentionPolicy'

import { txQuery } from '@/src/platform/db/postgres'

type ConfigVersionRetentionTarget = {
  key: string
  table: string
  alias: string
  stationPredicateSql: string
  partitionSql: string
}

export const CONFIG_VERSION_RETENTION_KEYS = [
  'station_config_versions',
  'plugin_config_versions',
  'device_config_versions',
] as const

export function buildConfigVersionRetentionTargets(): ConfigVersionRetentionTarget[] {
  return [
    {
      key: 'station_config_versions',
      table: 'station_config_versions',
      alias: 'version_row',
      stationPredicateSql: 'version_row.station_id = $1::uuid',
      partitionSql: 'version_row.station_id',
    },
    {
      key: 'plugin_config_versions',
      table: 'plugin_config_versions',
      alias: 'version_row',
      stationPredicateSql: 'version_row.station_id = $1::text',
      partitionSql:
        'version_row.station_id, version_row.process_type, version_row.plugin_name',
    },
    {
      key: 'device_config_versions',
      table: 'device_config_versions',
      alias: 'version_row',
      stationPredicateSql: 'version_row.station_id = $1::text',
      partitionSql:
        'version_row.station_id, version_row.device_type, version_row.device_key',
    },
  ]
}

const serializeTimestamp = (value: Date | string | null | undefined) => {
  if (value instanceof Date) return value.toISOString()
  return value == null ? null : String(value)
}

function candidateSql(target: ConfigVersionRetentionTarget, dryRun: boolean) {
  const lock = dryRun ? '' : `FOR UPDATE OF ${target.alias} SKIP LOCKED`
  const action = dryRun
    ? 'SELECT candidate_id AS id FROM candidates'
    : `DELETE FROM ${target.table} AS target
         USING candidates
        WHERE target.id = candidates.candidate_id
        RETURNING target.id`

  return `WITH ranked AS (
    SELECT ${target.alias}.id,
           ROW_NUMBER() OVER (
             PARTITION BY ${target.partitionSql}
             ORDER BY ${target.alias}.created_at DESC, ${target.alias}.id DESC
           ) AS version_rank
      FROM ${target.table} AS ${target.alias}
     WHERE ${target.stationPredicateSql}
  ),
  candidates AS (
    SELECT ${target.alias}.id AS candidate_id
      FROM ${target.table} AS ${target.alias}
      JOIN ranked ON ranked.id = ${target.alias}.id
     WHERE ranked.version_rank > $2
       AND COALESCE(${target.alias}.is_pinned, FALSE) = FALSE
       AND ${target.alias}.created_at < NOW() - ($3 * INTERVAL '1 day')
     ORDER BY ${target.alias}.created_at, ${target.alias}.id
     LIMIT $4
     ${lock}
  )
  ${action}`
}

async function oldestRemaining(
  client: PoolClient,
  stationId: string,
  target: ConfigVersionRetentionTarget,
  policy: StorageRetentionPolicy,
) {
  const result = await txQuery<{ oldest_remaining: Date | string | null }>(
    client,
    `WITH ranked AS (
      SELECT ${target.alias}.id,
             ${target.alias}.created_at,
             ${target.alias}.is_pinned,
             ROW_NUMBER() OVER (
               PARTITION BY ${target.partitionSql}
               ORDER BY ${target.alias}.created_at DESC, ${target.alias}.id DESC
             ) AS version_rank
        FROM ${target.table} AS ${target.alias}
       WHERE ${target.stationPredicateSql}
    )
    SELECT MIN(created_at) AS oldest_remaining
      FROM ranked
     WHERE version_rank > $2
       AND COALESCE(is_pinned, FALSE) = FALSE
       AND created_at < NOW() - ($3 * INTERVAL '1 day')`,
    [stationId, policy.configVersionLimit, policy.configVersionMinAgeDays],
  )
  return serializeTimestamp(result.rows[0]?.oldest_remaining)
}

async function pruneTarget(input: {
  client: PoolClient
  stationId: string
  target: ConfigVersionRetentionTarget
  policy: StorageRetentionPolicy
}): Promise<StorageRetentionTargetResult> {
  const { client, stationId, target, policy } = input
  const startedAt = Date.now()
  const savepoint = `config_version_retention_${target.key}`
  await txQuery(client, `SAVEPOINT ${savepoint}`)
  let examined = 0
  let deleted = 0
  let batches = 0

  try {
    for (let index = 0; index < policy.maxBatches; index += 1) {
      const result = await txQuery<{ id: string | number }>(
        client,
        candidateSql(target, policy.dryRun),
        [
          stationId,
          policy.configVersionLimit,
          policy.configVersionMinAgeDays,
          policy.batchSize,
        ],
      )
      const candidateCount = result.rowCount ?? result.rows.length
      examined += candidateCount
      if (!policy.dryRun) deleted += candidateCount
      if (candidateCount > 0) batches += 1
      if (candidateCount < policy.batchSize || policy.dryRun) break
    }

    const result: StorageRetentionTargetResult = {
      key: target.key,
      retentionDays: policy.configVersionMinAgeDays,
      examined,
      deleted,
      compacted: 0,
      skipped: policy.dryRun ? examined : 0,
      batches,
      oldestRemaining: await oldestRemaining(client, stationId, target, policy),
      durationMs: Date.now() - startedAt,
      error: null,
    }
    await txQuery(client, `RELEASE SAVEPOINT ${savepoint}`)
    return result
  } catch (error) {
    await txQuery(client, `ROLLBACK TO SAVEPOINT ${savepoint}`)
    await txQuery(client, `RELEASE SAVEPOINT ${savepoint}`)
    return {
      key: target.key,
      retentionDays: policy.configVersionMinAgeDays,
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

export async function pruneConfigVersionHistory(input: {
  client: PoolClient
  stationId: string
  policy: StorageRetentionPolicy
  targetKeys?: ReadonlySet<string> | null
}): Promise<StorageRetentionTargetResult[]> {
  const targets = buildConfigVersionRetentionTargets().filter(
    (target) =>
      !input.targetKeys ||
      input.targetKeys.has('config_versions') ||
      input.targetKeys.has(target.key),
  )

  const results: StorageRetentionTargetResult[] = []
  for (const target of targets) {
    results.push(
      await pruneTarget({
        client: input.client,
        stationId: input.stationId,
        target,
        policy: input.policy,
      }),
    )
  }
  return results
}
