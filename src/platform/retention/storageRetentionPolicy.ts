import { readBooleanEnv, readNumberEnv } from '@/src/platform/config/env'

export type StorageRetentionPolicy = {
  enabled: boolean
  dryRun: boolean
  cleanupIntervalMs: number
  batchSize: number
  maxBatches: number
  printDoneDays: number
  printFailedDays: number
  transactionQueueDoneDays: number
  transactionQueueFailedDays: number
  reportQueueDoneDays: number
  reportQueueFailedDays: number
  fiscalInboxProcessedDays: number
  fiscalInboxResolvedDeadDays: number
  auditLogDays: number
  vposLogDays: number
  forecourtRoutineEventDays: number
  forecourtErrorEventDays: number
  forecourtMaintenanceSecurityEventDays: number
  forecourtFieldEvidenceEventDays: number
  jplCheckpointClearedDays: number
  jplSupervisedReplayClearedDays: number
  configVersionLimit: number
  configVersionMinAgeDays: number
  pssParsedCompatibilityDays: number
  forecourtPayloadCompactionEnabled: boolean
  forecourtPayloadDryRun: boolean
  forecourtPayloadGraceDays: number
}

type EnvSource = Record<string, string | undefined>

const DEFAULTS = {
  cleanupIntervalMs: 6 * 60 * 60 * 1000,
  batchSize: 500,
  maxBatches: 10,
  printDoneDays: 7,
  printFailedDays: 30,
  transactionQueueDoneDays: 7,
  transactionQueueFailedDays: 90,
  reportQueueDoneDays: 14,
  reportQueueFailedDays: 30,
  fiscalInboxProcessedDays: 30,
  fiscalInboxResolvedDeadDays: 90,
  auditLogDays: 30,
  vposLogDays: 30,
  forecourtRoutineEventDays: 7,
  forecourtErrorEventDays: 30,
  forecourtMaintenanceSecurityEventDays: 90,
  forecourtFieldEvidenceEventDays: 180,
  jplCheckpointClearedDays: 30,
  jplSupervisedReplayClearedDays: 14,
  configVersionLimit: 20,
  configVersionMinAgeDays: 7,
  pssParsedCompatibilityDays: 30,
  forecourtPayloadGraceDays: 7,
} as const

function parseBoolean(
  source: EnvSource | undefined,
  name: string,
  fallback: boolean,
) {
  if (!source) return readBooleanEnv(name, fallback)
  const raw = source[name]?.trim().toLowerCase()
  if (!raw) return fallback
  if (['1', 'true', 'yes', 'on'].includes(raw)) return true
  if (['0', 'false', 'no', 'off'].includes(raw)) return false
  return fallback
}

function parseNumber(
  source: EnvSource | undefined,
  name: string,
  fallback: number,
) {
  if (!source) return readNumberEnv(name, fallback)
  const raw = source[name]?.trim()
  if (!raw) return fallback
  const value = Number(raw)
  return Number.isFinite(value) ? value : fallback
}

function clampInteger(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, Math.floor(value)))
}

function retentionDays(
  source: EnvSource | undefined,
  name: string,
  fallback: number,
) {
  return clampInteger(parseNumber(source, name, fallback), 0, 3650)
}

export function getStorageRetentionPolicy(
  source?: EnvSource,
): StorageRetentionPolicy {
  return {
    enabled: parseBoolean(source, 'VPOS_RETENTION_ENABLED', false),
    dryRun: parseBoolean(source, 'VPOS_RETENTION_DRY_RUN', true),
    cleanupIntervalMs: clampInteger(
      parseNumber(
        source,
        'VPOS_RETENTION_CLEANUP_INTERVAL_MS',
        DEFAULTS.cleanupIntervalMs,
      ),
      60_000,
      7 * 24 * 60 * 60 * 1000,
    ),
    batchSize: clampInteger(
      parseNumber(source, 'VPOS_RETENTION_BATCH_SIZE', DEFAULTS.batchSize),
      1,
      5000,
    ),
    maxBatches: clampInteger(
      parseNumber(source, 'VPOS_RETENTION_MAX_BATCHES', DEFAULTS.maxBatches),
      1,
      100,
    ),
    printDoneDays: retentionDays(
      source,
      'VPOS_RETENTION_PRINT_DONE_DAYS',
      DEFAULTS.printDoneDays,
    ),
    printFailedDays: retentionDays(
      source,
      'VPOS_RETENTION_PRINT_FAILED_DAYS',
      DEFAULTS.printFailedDays,
    ),
    transactionQueueDoneDays: retentionDays(
      source,
      'VPOS_RETENTION_TRANSACTION_QUEUE_DONE_DAYS',
      DEFAULTS.transactionQueueDoneDays,
    ),
    transactionQueueFailedDays: retentionDays(
      source,
      'VPOS_RETENTION_TRANSACTION_QUEUE_FAILED_DAYS',
      DEFAULTS.transactionQueueFailedDays,
    ),
    reportQueueDoneDays: retentionDays(
      source,
      'VPOS_RETENTION_REPORT_QUEUE_DONE_DAYS',
      DEFAULTS.reportQueueDoneDays,
    ),
    reportQueueFailedDays: retentionDays(
      source,
      'VPOS_RETENTION_REPORT_QUEUE_FAILED_DAYS',
      DEFAULTS.reportQueueFailedDays,
    ),
    fiscalInboxProcessedDays: retentionDays(
      source,
      'VPOS_RETENTION_FISCAL_INBOX_PROCESSED_DAYS',
      DEFAULTS.fiscalInboxProcessedDays,
    ),
    fiscalInboxResolvedDeadDays: retentionDays(
      source,
      'VPOS_RETENTION_FISCAL_INBOX_RESOLVED_DEAD_DAYS',
      DEFAULTS.fiscalInboxResolvedDeadDays,
    ),
    auditLogDays: retentionDays(
      source,
      'VPOS_RETENTION_AUDIT_LOG_DAYS',
      DEFAULTS.auditLogDays,
    ),
    vposLogDays: retentionDays(
      source,
      'VPOS_RETENTION_VPOS_LOG_DAYS',
      DEFAULTS.vposLogDays,
    ),
    forecourtRoutineEventDays: retentionDays(
      source,
      'VPOS_RETENTION_FORECOURT_ROUTINE_DAYS',
      DEFAULTS.forecourtRoutineEventDays,
    ),
    forecourtErrorEventDays: retentionDays(
      source,
      'VPOS_RETENTION_FORECOURT_ERROR_DAYS',
      DEFAULTS.forecourtErrorEventDays,
    ),
    forecourtMaintenanceSecurityEventDays: retentionDays(
      source,
      'VPOS_RETENTION_FORECOURT_MAINTENANCE_SECURITY_DAYS',
      DEFAULTS.forecourtMaintenanceSecurityEventDays,
    ),
    forecourtFieldEvidenceEventDays: retentionDays(
      source,
      'VPOS_RETENTION_FORECOURT_FIELD_EVIDENCE_DAYS',
      DEFAULTS.forecourtFieldEvidenceEventDays,
    ),
    jplCheckpointClearedDays: retentionDays(
      source,
      'VPOS_RETENTION_JPL_CHECKPOINT_CLEARED_DAYS',
      DEFAULTS.jplCheckpointClearedDays,
    ),
    jplSupervisedReplayClearedDays: retentionDays(
      source,
      'VPOS_RETENTION_JPL_REPLAY_CLEARED_DAYS',
      DEFAULTS.jplSupervisedReplayClearedDays,
    ),
    configVersionLimit: clampInteger(
      parseNumber(
        source,
        'VPOS_RETENTION_CONFIG_VERSION_LIMIT',
        DEFAULTS.configVersionLimit,
      ),
      1,
      1000,
    ),
    configVersionMinAgeDays: retentionDays(
      source,
      'VPOS_RETENTION_CONFIG_VERSION_MIN_AGE_DAYS',
      DEFAULTS.configVersionMinAgeDays,
    ),
    pssParsedCompatibilityDays: retentionDays(
      source,
      'VPOS_RETENTION_PSS_PARSED_COMPATIBILITY_DAYS',
      DEFAULTS.pssParsedCompatibilityDays,
    ),
    forecourtPayloadCompactionEnabled: parseBoolean(
      source,
      'VPOS_FORECOURT_PAYLOAD_COMPACTION_ENABLED',
      false,
    ),
    forecourtPayloadDryRun: parseBoolean(
      source,
      'VPOS_FORECOURT_PAYLOAD_COMPACTION_DRY_RUN',
      true,
    ),
    forecourtPayloadGraceDays: retentionDays(
      source,
      'VPOS_FORECOURT_PAYLOAD_GRACE_DAYS',
      DEFAULTS.forecourtPayloadGraceDays,
    ),
  }
}
