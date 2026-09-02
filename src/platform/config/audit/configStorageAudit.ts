import type { PoolClient, QueryResultRow } from 'pg'

import { queryAll, queryOne, txQuery } from '@/src/platform/db/postgres'

export type ConfigStorageDependency = {
  objectType: string
  objectName: string
}

export type ConfigStorageAuditResult = {
  migrationApplied: boolean
  guardrailMigrationApplied: boolean
  retirementSupportMigrationApplied: boolean
  stationKv: {
    exists: boolean
    totalRows: number
    oversizedRows: number
    unregisteredKeyRows: number
    valueJsonExists: boolean
    valueJsonMeaningfulRows: number
    valueJsonDependencies: ConfigStorageDependency[]
    valueJsonSafeToDrop: boolean
  }
  stationSettings: {
    exists: boolean
    totalRows: number
    keyExists: boolean
    keyPopulatedRows: number
    valueJsonExists: boolean
    valueJsonMeaningfulRows: number
    keyNullable: boolean
    keyDependencies: ConfigStorageDependency[]
    valueJsonDependencies: ConfigStorageDependency[]
    keySafeToDrop: boolean
    valueJsonSafeToDrop: boolean
  }
  jobQueue: {
    exists: boolean
    totalRows: number
    byStatus: Record<string, number>
    dependencies: ConfigStorageDependency[]
    safeToDrop: boolean
  }
  retirementComplete: boolean
  readyToApply: boolean
  safeForDestructiveMigration: boolean
}

type AuditExecutor = {
  one: <T extends QueryResultRow>(
    sql: string,
    params?: unknown[],
  ) => Promise<T | null>
  all: <T extends QueryResultRow>(
    sql: string,
    params?: unknown[],
  ) => Promise<T[]>
}

const createExecutor = (client?: PoolClient): AuditExecutor => ({
  one: async <T extends QueryResultRow>(sql: string, params?: unknown[]) => {
    if (!client) return await queryOne<T>(sql, params)
    const result = await txQuery<T>(client, sql, params)
    return result.rows[0] ?? null
  },
  all: async <T extends QueryResultRow>(sql: string, params?: unknown[]) => {
    if (!client) return await queryAll<T>(sql, params)
    const result = await txQuery<T>(client, sql, params)
    return result.rows
  },
})

const toNumber = (value: unknown) => {
  const parsed = Number(value ?? 0)
  return Number.isFinite(parsed) ? parsed : 0
}

const dependencySql = `
  WITH dependency_rows AS (
    SELECT 'view'::text AS object_type,
           schemaname || '.' || viewname AS object_name
      FROM pg_views
     WHERE definition ILIKE $1
       AND definition ILIKE $2
    UNION ALL
    SELECT 'materialized_view'::text AS object_type,
           schemaname || '.' || matviewname AS object_name
      FROM pg_matviews
     WHERE definition ILIKE $1
       AND definition ILIKE $2
    UNION ALL
    SELECT CASE p.prokind
             WHEN 'p' THEN 'procedure'::text
             ELSE 'function'::text
           END AS object_type,
           n.nspname || '.' || p.proname AS object_name
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE p.prokind IN ('f', 'p')
       AND pg_get_functiondef(p.oid) ILIKE $1
       AND pg_get_functiondef(p.oid) ILIKE $2
    UNION ALL
    SELECT 'trigger'::text AS object_type,
           n.nspname || '.' || c.relname || '.' || t.tgname AS object_name
      FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE NOT t.tgisinternal
       AND pg_get_triggerdef(t.oid) ILIKE $1
       AND pg_get_triggerdef(t.oid) ILIKE $2
  )
  SELECT DISTINCT object_type AS "objectType", object_name AS "objectName"
    FROM dependency_rows
   ORDER BY object_type, object_name
`

const listTextDependencies = async (
  executor: AuditExecutor,
  relationName: string,
  memberName: string,
): Promise<ConfigStorageDependency[]> =>
  await executor.all<ConfigStorageDependency>(dependencySql, [
    `%${relationName}%`,
    `%${memberName}%`,
  ])

export const runConfigStorageAudit = async (
  client?: PoolClient,
): Promise<ConfigStorageAuditResult> => {
  const executor = createExecutor(client)
  const migrations = await executor.one<{
    guardrail_applied: boolean
    retirement_support_applied: boolean
  }>(
    `SELECT EXISTS (
       SELECT 1
         FROM schema_migrations
        WHERE name = '1263_configuration_ownership_guardrails.sql'
     ) AS guardrail_applied,
     EXISTS (
       SELECT 1
         FROM schema_migrations
        WHERE name = '1266_legacy_config_storage_retirement_support.sql'
     ) AS retirement_support_applied`,
  )

  const schema = await executor.one<{
    station_kv_exists: boolean
    station_kv_value_json_exists: boolean
    station_settings_exists: boolean
    station_settings_key_exists: boolean
    station_settings_value_json_exists: boolean
    job_queue_exists: boolean
  }>(
    `SELECT
       to_regclass(current_schema() || '.station_kv') IS NOT NULL AS station_kv_exists,
       EXISTS (
         SELECT 1
           FROM information_schema.columns
          WHERE table_schema = current_schema()
            AND table_name = 'station_kv'
            AND column_name = 'value_json'
       ) AS station_kv_value_json_exists,
       to_regclass(current_schema() || '.station_settings') IS NOT NULL AS station_settings_exists,
       EXISTS (
         SELECT 1
           FROM information_schema.columns
          WHERE table_schema = current_schema()
            AND table_name = 'station_settings'
            AND column_name = 'key'
       ) AS station_settings_key_exists,
       EXISTS (
         SELECT 1
           FROM information_schema.columns
          WHERE table_schema = current_schema()
            AND table_name = 'station_settings'
            AND column_name = 'value_json'
       ) AS station_settings_value_json_exists,
       to_regclass(current_schema() || '.job_queue') IS NOT NULL AS job_queue_exists`,
  )

  const stationKvExists = Boolean(schema?.station_kv_exists)
  const stationKvValueJsonExists = Boolean(schema?.station_kv_value_json_exists)
  const stationSettingsExists = Boolean(schema?.station_settings_exists)
  const stationSettingsKeyExists = Boolean(schema?.station_settings_key_exists)
  const stationSettingsValueJsonExists = Boolean(
    schema?.station_settings_value_json_exists,
  )
  const jobQueueExists = Boolean(schema?.job_queue_exists)

  const stationKv = stationKvExists
    ? await executor.one<{
        total_rows: string | number
        oversized_rows: string | number
        unregistered_key_rows: string | number
        value_json_meaningful_rows: string | number
      }>(
        `SELECT COUNT(*) AS total_rows,
              COUNT(*) FILTER (
                WHERE octet_length(value::text) > CASE
                  WHEN key LIKE 'env:%' THEN 16384
                  ELSE 8388608
                END
              ) AS oversized_rows,
              COUNT(*) FILTER (
                WHERE key !~ '^(env:|sync\\.cursor\\.|setup\\.|site\\.|proxy\\.|forecourt\\.|doms\\.|vpos\\.|pump\\.|pumps\\.|tanks\\.|console\\.|push\\.|legacy\\.|fiscal\\.|attendant\\.|pos\\.|pss\\.xml\\.|bootstrap\\.)'
              ) AS unregistered_key_rows,
              ${
                stationKvValueJsonExists
                  ? `COUNT(*) FILTER (
                       WHERE value_json IS NOT NULL
                         AND value_json IS DISTINCT FROM '{}'::jsonb
                     )`
                  : '0'
              } AS value_json_meaningful_rows
         FROM station_kv`,
      )
    : null

  const stationSettings = stationSettingsExists
    ? await executor.one<{
        total_rows: string | number
        key_populated_rows: string | number
        value_json_meaningful_rows: string | number
        key_nullable: boolean
      }>(
        `SELECT COUNT(*) AS total_rows,
              ${
                stationSettingsKeyExists
                  ? `COUNT(*) FILTER (
                       WHERE key IS NOT NULL AND BTRIM(key) <> ''
                     )`
                  : '0'
              } AS key_populated_rows,
              ${
                stationSettingsValueJsonExists
                  ? `COUNT(*) FILTER (
                       WHERE value_json IS NOT NULL
                         AND value_json IS DISTINCT FROM '{}'::jsonb
                     )`
                  : '0'
              } AS value_json_meaningful_rows,
              ${
                stationSettingsKeyExists
                  ? `COALESCE((
                       SELECT is_nullable = 'YES'
                         FROM information_schema.columns
                        WHERE table_schema = current_schema()
                          AND table_name = 'station_settings'
                          AND column_name = 'key'
                     ), FALSE)`
                  : 'TRUE'
              } AS key_nullable
         FROM station_settings`,
      )
    : null

  const jobQueueRows = jobQueueExists
    ? await executor.all<{ status: string; count: string | number }>(
        `SELECT status, COUNT(*) AS count
           FROM job_queue
          GROUP BY status
          ORDER BY status`,
      )
    : []

  const [
    stationKvValueJsonDependencies,
    stationSettingsKeyDependencies,
    stationSettingsValueJsonDependencies,
    jobQueueDependencies,
  ] = await Promise.all([
    stationKvValueJsonExists
      ? listTextDependencies(executor, 'station_kv', 'value_json')
      : Promise.resolve([]),
    stationSettingsKeyExists
      ? listTextDependencies(executor, 'station_settings', 'key')
      : Promise.resolve([]),
    stationSettingsValueJsonExists
      ? listTextDependencies(executor, 'station_settings', 'value_json')
      : Promise.resolve([]),
    jobQueueExists
      ? listTextDependencies(executor, 'job_queue', 'job_queue')
      : Promise.resolve([]),
  ])

  const jobQueueByStatus = Object.fromEntries(
    jobQueueRows.map((row) => [row.status, toNumber(row.count)]),
  )
  const jobQueueTotal = Object.values(jobQueueByStatus).reduce(
    (total, count) => total + count,
    0,
  )

  const valueJsonMeaningfulRows = toNumber(
    stationKv?.value_json_meaningful_rows,
  )
  const stationSettingsKeyPopulatedRows = toNumber(
    stationSettings?.key_populated_rows,
  )
  const stationSettingsValueJsonMeaningfulRows = toNumber(
    stationSettings?.value_json_meaningful_rows,
  )
  const stationKvValueJsonSafe =
    !stationKvValueJsonExists ||
    (valueJsonMeaningfulRows === 0 &&
      stationKvValueJsonDependencies.length === 0)
  const stationSettingsKeySafe =
    !stationSettingsKeyExists ||
    (stationSettingsKeyPopulatedRows === 0 &&
      Boolean(stationSettings?.key_nullable) &&
      stationSettingsKeyDependencies.length === 0)
  const stationSettingsValueJsonSafe =
    !stationSettingsValueJsonExists ||
    (stationSettingsValueJsonMeaningfulRows === 0 &&
      stationSettingsValueJsonDependencies.length === 0)
  const jobQueueSafe =
    !jobQueueExists ||
    (jobQueueTotal === 0 && jobQueueDependencies.length === 0)
  const guardrailMigrationApplied = Boolean(migrations?.guardrail_applied)
  const retirementSupportMigrationApplied = Boolean(
    migrations?.retirement_support_applied,
  )
  const retirementComplete =
    stationKvExists &&
    stationSettingsExists &&
    !stationKvValueJsonExists &&
    !stationSettingsKeyExists &&
    !stationSettingsValueJsonExists &&
    !jobQueueExists
  const safeForDestructiveMigration =
    guardrailMigrationApplied &&
    retirementSupportMigrationApplied &&
    stationKvExists &&
    stationSettingsExists &&
    stationKvValueJsonSafe &&
    stationSettingsKeySafe &&
    stationSettingsValueJsonSafe &&
    jobQueueSafe

  return {
    migrationApplied: guardrailMigrationApplied,
    guardrailMigrationApplied,
    retirementSupportMigrationApplied,
    stationKv: {
      exists: stationKvExists,
      totalRows: toNumber(stationKv?.total_rows),
      oversizedRows: toNumber(stationKv?.oversized_rows),
      unregisteredKeyRows: toNumber(stationKv?.unregistered_key_rows),
      valueJsonExists: stationKvValueJsonExists,
      valueJsonMeaningfulRows,
      valueJsonDependencies: stationKvValueJsonDependencies,
      valueJsonSafeToDrop: stationKvValueJsonSafe,
    },
    stationSettings: {
      exists: stationSettingsExists,
      totalRows: toNumber(stationSettings?.total_rows),
      keyExists: stationSettingsKeyExists,
      keyPopulatedRows: stationSettingsKeyPopulatedRows,
      valueJsonExists: stationSettingsValueJsonExists,
      valueJsonMeaningfulRows: stationSettingsValueJsonMeaningfulRows,
      keyNullable: stationSettingsKeyExists
        ? Boolean(stationSettings?.key_nullable)
        : true,
      keyDependencies: stationSettingsKeyDependencies,
      valueJsonDependencies: stationSettingsValueJsonDependencies,
      keySafeToDrop: stationSettingsKeySafe,
      valueJsonSafeToDrop: stationSettingsValueJsonSafe,
    },
    jobQueue: {
      exists: jobQueueExists,
      totalRows: jobQueueTotal,
      byStatus: jobQueueByStatus,
      dependencies: jobQueueDependencies,
      safeToDrop: jobQueueSafe,
    },
    retirementComplete,
    readyToApply: safeForDestructiveMigration && !retirementComplete,
    safeForDestructiveMigration,
  }
}
