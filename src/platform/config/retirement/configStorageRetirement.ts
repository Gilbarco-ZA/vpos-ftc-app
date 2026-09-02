import { randomUUID } from 'node:crypto'
import type { ConfigStorageAuditResult } from '@/src/platform/config/audit/configStorageAudit'
import type { PoolClient } from 'pg'

import { runConfigStorageAudit } from '@/src/platform/config/audit/configStorageAudit'
import { getPool, txQuery } from '@/src/platform/db/postgres'

export const CONFIG_STORAGE_RETIREMENT_KEY = 'legacy-configuration-storage-v1'
export const CONFIG_STORAGE_RETIREMENT_ACK = 'DROP_LEGACY_CONFIG_STORAGE'
export const CONFIG_STORAGE_RESTORE_ACK =
  'RESTORE_LEGACY_CONFIG_STORAGE_COMPATIBILITY'

const LOCK_KEY_1 = 941227
const LOCK_KEY_2 = 220926

export type ConfigStorageRetirementPlan = {
  retirementKey: string
  retirementComplete: boolean
  readyToApply: boolean
  blockers: string[]
  candidates: Array<{
    object: string
    exists: boolean
    safeToDrop: boolean
    meaningfulRows: number
    dependencies: number
  }>
  audit: ConfigStorageAuditResult
}

export type RetireConfigStorageInput = {
  acknowledgement: string
  maintenanceConfirmed: boolean
  backupReference: string
  operatorName: string
  applicationVersion: string
}

export type RestoreConfigStorageInput = {
  acknowledgement: string
  sourceRunId: string
  operatorName: string
  applicationVersion: string
}

export type ConfigStorageRetirementResult = {
  runId: string
  action: 'RETIRE' | 'RESTORE_COMPATIBILITY'
  auditBefore: ConfigStorageAuditResult
  auditAfter: ConfigStorageAuditResult
}

const requireNonEmpty = (value: string, label: string) => {
  const normalized = value.trim()
  if (!normalized) throw new Error(`${label} is required`)
  return normalized
}

export const buildConfigStorageRetirementPlan = (
  audit: ConfigStorageAuditResult,
): ConfigStorageRetirementPlan => {
  const blockers: string[] = []

  if (!audit.guardrailMigrationApplied) {
    blockers.push('Phase 5A guardrail migration 1263 is not applied')
  }
  if (!audit.retirementSupportMigrationApplied) {
    blockers.push('Phase 5D retirement support migration 1266 is not applied')
  }
  if (!audit.stationKv.exists) {
    blockers.push('Canonical station_kv table is missing')
  }
  if (!audit.stationSettings.exists) {
    blockers.push('Canonical station_settings table is missing')
  }
  if (!audit.stationKv.valueJsonSafeToDrop) {
    blockers.push(
      'station_kv.value_json contains meaningful rows or database dependencies',
    )
  }
  if (!audit.stationSettings.keySafeToDrop) {
    blockers.push(
      'station_settings.key is populated, non-nullable, or has database dependencies',
    )
  }
  if (!audit.stationSettings.valueJsonSafeToDrop) {
    blockers.push(
      'station_settings.value_json contains meaningful rows or database dependencies',
    )
  }
  if (!audit.jobQueue.safeToDrop) {
    blockers.push('job_queue contains rows or database dependencies')
  }

  return {
    retirementKey: CONFIG_STORAGE_RETIREMENT_KEY,
    retirementComplete: audit.retirementComplete,
    readyToApply: audit.readyToApply && blockers.length === 0,
    blockers,
    candidates: [
      {
        object: 'station_kv.value_json',
        exists: audit.stationKv.valueJsonExists,
        safeToDrop: audit.stationKv.valueJsonSafeToDrop,
        meaningfulRows: audit.stationKv.valueJsonMeaningfulRows,
        dependencies: audit.stationKv.valueJsonDependencies.length,
      },
      {
        object: 'station_settings.key',
        exists: audit.stationSettings.keyExists,
        safeToDrop: audit.stationSettings.keySafeToDrop,
        meaningfulRows: audit.stationSettings.keyPopulatedRows,
        dependencies: audit.stationSettings.keyDependencies.length,
      },
      {
        object: 'station_settings.value_json',
        exists: audit.stationSettings.valueJsonExists,
        safeToDrop: audit.stationSettings.valueJsonSafeToDrop,
        meaningfulRows: audit.stationSettings.valueJsonMeaningfulRows,
        dependencies: audit.stationSettings.valueJsonDependencies.length,
      },
      {
        object: 'job_queue',
        exists: audit.jobQueue.exists,
        safeToDrop: audit.jobQueue.safeToDrop,
        meaningfulRows: audit.jobQueue.totalRows,
        dependencies: audit.jobQueue.dependencies.length,
      },
    ],
    audit,
  }
}

export const getConfigStorageRetirementPlan = async () =>
  buildConfigStorageRetirementPlan(await runConfigStorageAudit())

const beginRetirementTransaction = async (client: PoolClient) => {
  await client.query('BEGIN')
  await client.query(`SET LOCAL lock_timeout = '5s'`)
  await client.query(`SET LOCAL statement_timeout = '30s'`)
  await client.query('SELECT pg_advisory_xact_lock($1, $2)', [
    LOCK_KEY_1,
    LOCK_KEY_2,
  ])
}

const insertRun = async (
  client: PoolClient,
  input: {
    id: string
    action: 'RETIRE' | 'RESTORE_COMPATIBILITY'
    applicationVersion: string
    operatorName: string
    backupReference?: string | null
    maintenanceConfirmed: boolean
    sourceRunId?: string | null
    auditBefore: ConfigStorageAuditResult
    details: Record<string, unknown>
  },
) => {
  await txQuery(
    client,
    `INSERT INTO config_storage_retirement_runs (
       id,
       retirement_key,
       action,
       status,
       application_version,
       operator_name,
       backup_reference,
       maintenance_confirmed,
       source_run_id,
       audit_before,
       details
     ) VALUES ($1, $2, $3, 'PREPARED', $4, $5, $6, $7, $8, $9::jsonb, $10::jsonb)`,
    [
      input.id,
      CONFIG_STORAGE_RETIREMENT_KEY,
      input.action,
      input.applicationVersion,
      input.operatorName,
      input.backupReference ?? null,
      input.maintenanceConfirmed,
      input.sourceRunId ?? null,
      JSON.stringify(input.auditBefore),
      JSON.stringify(input.details),
    ],
  )
}

const completeRun = async (
  client: PoolClient,
  runId: string,
  auditAfter: ConfigStorageAuditResult,
) => {
  await txQuery(
    client,
    `UPDATE config_storage_retirement_runs
        SET status = 'APPLIED',
            audit_after = $2::jsonb,
            completed_at = CURRENT_TIMESTAMP
      WHERE id = $1`,
    [runId, JSON.stringify(auditAfter)],
  )
}

export const retireLegacyConfigStorage = async (
  input: RetireConfigStorageInput,
): Promise<ConfigStorageRetirementResult> => {
  if (input.acknowledgement !== CONFIG_STORAGE_RETIREMENT_ACK) {
    throw new Error(
      `Retirement requires acknowledgement ${CONFIG_STORAGE_RETIREMENT_ACK}`,
    )
  }
  if (!input.maintenanceConfirmed) {
    throw new Error('A maintenance window must be explicitly confirmed')
  }

  const backupReference = requireNonEmpty(
    input.backupReference,
    'backupReference',
  )
  const operatorName = requireNonEmpty(input.operatorName, 'operatorName')
  const applicationVersion = requireNonEmpty(
    input.applicationVersion,
    'applicationVersion',
  )
  const pool = getPool()
  const client = await pool.connect()
  const runId = randomUUID()

  try {
    await beginRetirementTransaction(client)
    const auditBefore = await runConfigStorageAudit(client)
    const plan = buildConfigStorageRetirementPlan(auditBefore)

    if (plan.retirementComplete) {
      throw new Error('Legacy configuration storage is already retired')
    }
    if (!plan.readyToApply) {
      throw new Error(
        `Legacy configuration storage is not safe to retire: ${plan.blockers.join('; ')}`,
      )
    }

    await insertRun(client, {
      id: runId,
      action: 'RETIRE',
      applicationVersion,
      operatorName,
      backupReference,
      maintenanceConfirmed: true,
      auditBefore,
      details: {
        candidates: plan.candidates,
        rollbackBoundary:
          'Compatibility-shell restore only. Historical data requires the referenced external database backup.',
      },
    })

    await client.query(
      'ALTER TABLE station_kv DROP COLUMN IF EXISTS value_json',
    )
    await client.query('ALTER TABLE station_settings DROP COLUMN IF EXISTS key')
    await client.query(
      'ALTER TABLE station_settings DROP COLUMN IF EXISTS value_json',
    )
    await client.query('DROP TABLE IF EXISTS job_queue RESTRICT')

    const auditAfter = await runConfigStorageAudit(client)
    if (!auditAfter.retirementComplete) {
      throw new Error('Post-retirement audit did not confirm complete removal')
    }

    await completeRun(client, runId, auditAfter)
    await client.query('COMMIT')

    return {
      runId,
      action: 'RETIRE',
      auditBefore,
      auditAfter,
    }
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined)
    throw error
  } finally {
    client.release()
  }
}

const restoreCompatibilitySchema = async (client: PoolClient) => {
  await client.query(
    'ALTER TABLE station_kv ADD COLUMN IF NOT EXISTS value_json JSONB',
  )
  await client.query(
    'ALTER TABLE station_settings ADD COLUMN IF NOT EXISTS key VARCHAR(255)',
  )
  await client.query(
    'ALTER TABLE station_settings ADD COLUMN IF NOT EXISTS value_json JSONB',
  )
  await client.query(`
    CREATE TABLE IF NOT EXISTS job_queue (
      id UUID PRIMARY KEY,
      station_id UUID REFERENCES fuel_stations(id),
      job_type VARCHAR(50) NOT NULL,
      payload JSONB NOT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'PENDING'
        CHECK (status IN ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED')),
      priority INTEGER NOT NULL DEFAULT 0,
      attempts INTEGER NOT NULL DEFAULT 0,
      max_attempts INTEGER NOT NULL DEFAULT 3,
      scheduled_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      started_at TIMESTAMPTZ,
      completed_at TIMESTAMPTZ,
      last_error TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `)
  await client.query(
    'CREATE INDEX IF NOT EXISTS idx_job_queue_status ON job_queue(status)',
  )
  await client.query(
    `CREATE INDEX IF NOT EXISTS idx_job_queue_scheduled
       ON job_queue(scheduled_at) WHERE status = 'PENDING'`,
  )
  await client.query(
    'CREATE INDEX IF NOT EXISTS idx_job_queue_type ON job_queue(job_type)',
  )
  await client.query(
    'CREATE INDEX IF NOT EXISTS idx_job_queue_station_id ON job_queue(station_id)',
  )
  await client.query(`COMMENT ON COLUMN station_kv.value_json IS
    'Compatibility shell restored after Phase 5D retirement. No current application reader/writer.'`)
  await client.query(`COMMENT ON COLUMN station_settings.key IS
    'Compatibility shell restored after Phase 5D retirement. Nullable and not a current settings owner.'`)
  await client.query(`COMMENT ON COLUMN station_settings.value_json IS
    'Compatibility shell restored after Phase 5D retirement. No current application reader/writer.'`)
  await client.query(`COMMENT ON TABLE job_queue IS
    'Compatibility shell restored after Phase 5D retirement. Do not use for new work.'`)
}

export const restoreLegacyConfigStorageCompatibility = async (
  input: RestoreConfigStorageInput,
): Promise<ConfigStorageRetirementResult> => {
  if (input.acknowledgement !== CONFIG_STORAGE_RESTORE_ACK) {
    throw new Error(
      `Compatibility restore requires acknowledgement ${CONFIG_STORAGE_RESTORE_ACK}`,
    )
  }

  const sourceRunId = requireNonEmpty(input.sourceRunId, 'sourceRunId')
  const operatorName = requireNonEmpty(input.operatorName, 'operatorName')
  const applicationVersion = requireNonEmpty(
    input.applicationVersion,
    'applicationVersion',
  )
  const pool = getPool()
  const client = await pool.connect()
  const runId = randomUUID()

  try {
    await beginRetirementTransaction(client)
    const sourceRun = await txQuery<{ id: string }>(
      client,
      `SELECT id
         FROM config_storage_retirement_runs
        WHERE id = $1
          AND retirement_key = $2
          AND action = 'RETIRE'
          AND status = 'APPLIED'
        FOR UPDATE`,
      [sourceRunId, CONFIG_STORAGE_RETIREMENT_KEY],
    )
    if (!sourceRun.rows[0]) {
      throw new Error('Applied retirement run was not found')
    }

    const auditBefore = await runConfigStorageAudit(client)
    if (!auditBefore.retirementComplete) {
      throw new Error('Legacy compatibility storage is already present')
    }

    await insertRun(client, {
      id: runId,
      action: 'RESTORE_COMPATIBILITY',
      applicationVersion,
      operatorName,
      maintenanceConfirmed: true,
      sourceRunId,
      auditBefore,
      details: {
        dataRestored: false,
        warning:
          'This action restores only nullable compatibility columns and an empty generic queue. Use the external backup for historical data or older-binary rollback.',
      },
    })

    await restoreCompatibilitySchema(client)
    const auditAfter = await runConfigStorageAudit(client)
    if (auditAfter.retirementComplete) {
      throw new Error('Compatibility restore did not recreate the legacy shell')
    }

    await completeRun(client, runId, auditAfter)
    await client.query('COMMIT')

    return {
      runId,
      action: 'RESTORE_COMPATIBILITY',
      auditBefore,
      auditAfter,
    }
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined)
    throw error
  } finally {
    client.release()
  }
}
