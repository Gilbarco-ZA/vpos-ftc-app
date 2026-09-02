import { queryOne } from '@/src/platform/db/postgres'

import type { FiscalizationTransport } from './route'
import { isTanzaniaCountry } from './country'
import {
  normalizeConfiguredFiscalizationTransport,
  resolveStationFiscalizationRoute,
} from './route'

export type TanzaniaQueueSummary = {
  pending: number
  processing: number
  failed: number
  ready: number
  totalOpen: number
  oldestOpenAt: string | null
  lastError: string | null
}

export type TanzaniaRouteSwitchSnapshot = {
  stationId: string
  country: string | null
  fiscalizationEngine: string | null
  currentTransport: FiscalizationTransport
  routeReason?: string | null
  traRegistrationStatus: string | null
  ewuraRegistrationStatus: string | null
  signingKeyConfigured: boolean
  certSerialConfigured: boolean
  traBaseUrlConfigured: boolean
  traTokenCredentialsConfigured: boolean
  ewuraBaseUrlConfigured: boolean
  ewuraApiSourceConfigured: boolean
  proxyUrlConfigured: boolean
  eligibleProxyTransactions: number
  queues: {
    localTransactions: TanzaniaQueueSummary
    proxyTransactions: TanzaniaQueueSummary
    localReports: TanzaniaQueueSummary
    proxyReports: TanzaniaQueueSummary
    ewuraTransactions: TanzaniaQueueSummary
    ewuraReports: TanzaniaQueueSummary
    ewuraRegistration: TanzaniaQueueSummary
    traZReports: TanzaniaQueueSummary
  }
}

export type TanzaniaRouteSwitchIssue = {
  code: string
  severity: 'blocker' | 'warning'
  message: string
  details?: Record<string, unknown>
}

export type TanzaniaRouteSwitchChecklistItem = {
  code: string
  label: string
  status: 'pass' | 'warn' | 'block'
  evidence?: string
}

export type TanzaniaRouteSwitchSafetyResult = {
  stationId: string
  from: FiscalizationTransport
  to: FiscalizationTransport
  direction: 'unchanged' | 'local_to_proxy' | 'proxy_to_local'
  allowed: boolean
  requiresConfirmation: boolean
  blockers: TanzaniaRouteSwitchIssue[]
  warnings: TanzaniaRouteSwitchIssue[]
  checklist: TanzaniaRouteSwitchChecklistItem[]
  snapshot: TanzaniaRouteSwitchSnapshot
  evaluatedAt: string
}

const OPEN_STATUSES = new Set(['PENDING', 'PROCESSING', 'FAILED'])
const SUCCESS_TRA_REGISTRATION_STATUSES = new Set([
  'REGISTERED',
  'SENT',
  'ACTIVE',
  'COMPLETED',
  'COMPLETE',
  'SUCCESS',
])
const SUCCESS_EWURA_REGISTRATION_STATUSES = new Set([
  'SENT',
  'REGISTERED',
  'ACTIVE',
  'COMPLETED',
  'COMPLETE',
  'SUCCESS',
])

const zeroQueue = (): TanzaniaQueueSummary => ({
  pending: 0,
  processing: 0,
  failed: 0,
  ready: 0,
  totalOpen: 0,
  oldestOpenAt: null,
  lastError: null,
})

function asInt(value: unknown): number {
  const n = Number(value ?? 0)
  return Number.isFinite(n) ? Math.max(0, Math.trunc(n)) : 0
}

function text(value: unknown): string | null {
  const output = String(value ?? '').trim()
  return output.length ? output : null
}

function bool(value: unknown): boolean {
  if (typeof value === 'boolean') return value
  const normalized = String(value ?? '')
    .trim()
    .toLowerCase()
  return ['1', 'true', 'yes', 'y'].includes(normalized)
}

function upper(value: unknown): string | null {
  const output = text(value)
  return output ? output.toUpperCase() : null
}

function queueFromRow(
  prefix: string,
  row: Record<string, any>,
): TanzaniaQueueSummary {
  const pending = asInt(row[`${prefix}_pending`])
  const processing = asInt(row[`${prefix}_processing`])
  const failed = asInt(row[`${prefix}_failed`])
  return {
    pending,
    processing,
    failed,
    ready: asInt(row[`${prefix}_ready`]),
    totalOpen: pending + processing + failed,
    oldestOpenAt: text(row[`${prefix}_oldest_open_at`]),
    lastError: text(row[`${prefix}_last_error`]),
  }
}

function makeIssue(
  severity: TanzaniaRouteSwitchIssue['severity'],
  code: string,
  message: string,
  details?: Record<string, unknown>,
): TanzaniaRouteSwitchIssue {
  return { code, severity, message, ...(details ? { details } : {}) }
}

function checklistItem(
  code: string,
  label: string,
  status: TanzaniaRouteSwitchChecklistItem['status'],
  evidence?: string,
): TanzaniaRouteSwitchChecklistItem {
  return { code, label, status, ...(evidence ? { evidence } : {}) }
}

function addOpenQueueIssue(
  issues: TanzaniaRouteSwitchIssue[],
  severity: TanzaniaRouteSwitchIssue['severity'],
  code: string,
  label: string,
  queue: TanzaniaQueueSummary,
) {
  if (queue.totalOpen <= 0) return
  issues.push(
    makeIssue(
      severity,
      code,
      `${label} still has ${queue.totalOpen} open item(s). Drain or reconcile this queue before switching fiscalization route.`,
      {
        pending: queue.pending,
        processing: queue.processing,
        failed: queue.failed,
        oldestOpenAt: queue.oldestOpenAt,
        lastError: queue.lastError,
      },
    ),
  )
}

function successfulRegistration(
  value: string | null,
  valid: Set<string>,
): boolean {
  const normalized = upper(value)
  return !!normalized && valid.has(normalized)
}

export function evaluateTanzaniaRouteSwitchSafety(args: {
  snapshot: TanzaniaRouteSwitchSnapshot
  targetTransport: unknown
  now?: Date
}): TanzaniaRouteSwitchSafetyResult {
  const snapshot = args.snapshot
  // Route-switch safety retains the stored legacy transport so operators can
  // inspect and drain pre-cutover queues. Executable runtime routing remains
  // proxy-only through normalizeFiscalizationTransport/resolveStationFiscalizationRoute.
  const targetTransport = normalizeConfiguredFiscalizationTransport(
    args.targetTransport,
  )
  const currentTransport = normalizeConfiguredFiscalizationTransport(
    snapshot.currentTransport,
  )
  const direction =
    currentTransport === targetTransport
      ? 'unchanged'
      : currentTransport === 'local_tz' && targetTransport === 'proxy'
        ? 'local_to_proxy'
        : 'proxy_to_local'

  const blockers: TanzaniaRouteSwitchIssue[] = []
  const warnings: TanzaniaRouteSwitchIssue[] = []
  const checklist: TanzaniaRouteSwitchChecklistItem[] = []

  const countryIsTanzania = isTanzaniaCountry(snapshot.country)
  const engineIsTanzania =
    String(snapshot.fiscalizationEngine ?? '')
      .trim()
      .toUpperCase() === 'TZ'
  const legacyLocalTargetValid = countryIsTanzania && engineIsTanzania
  const targetValidationReason = !countryIsTanzania
    ? `Local Tanzania fiscalization is only valid for Tanzania stations. Current country: ${snapshot.country || 'not configured'}.`
    : !engineIsTanzania
      ? `Local Tanzania fiscalization requires fiscalization_engine TZ. Current engine: ${snapshot.fiscalizationEngine || 'not configured'}.`
      : null

  if (targetTransport === 'local_tz' && !legacyLocalTargetValid) {
    blockers.push(
      makeIssue(
        'blocker',
        'target-route-not-local-tanzania',
        targetValidationReason ??
          'Local Tanzania fiscalization is not available for this station.',
      ),
    )
  }

  if (direction === 'proxy_to_local') {
    addOpenQueueIssue(
      blockers,
      'blocker',
      'proxy-transaction-queue-open',
      'Existing transaction queue',
      snapshot.queues.localTransactions,
    )
    addOpenQueueIssue(
      blockers,
      'blocker',
      'proxy-report-queue-open',
      'Proxy report queue',
      snapshot.queues.proxyReports,
    )

    if (snapshot.eligibleProxyTransactions > 0) {
      blockers.push(
        makeIssue(
          'blocker',
          'eligible-proxy-transactions-open',
          `${snapshot.eligibleProxyTransactions} transaction(s) still look eligible for proxy fiscalization. Let the proxy worker finish or reconcile them before switching to local Tanzania.`,
          { eligibleProxyTransactions: snapshot.eligibleProxyTransactions },
        ),
      )
    }
  }

  if (direction === 'local_to_proxy') {
    addOpenQueueIssue(
      blockers,
      'blocker',
      'local-transaction-queue-open',
      'Local Tanzania transaction queue',
      snapshot.queues.localTransactions,
    )
    addOpenQueueIssue(
      blockers,
      'blocker',
      'local-report-queue-open',
      'Local Tanzania report queue',
      snapshot.queues.localReports,
    )
    addOpenQueueIssue(
      blockers,
      'blocker',
      'tra-z-report-open',
      'TRA z-report queue',
      snapshot.queues.traZReports,
    )
    addOpenQueueIssue(
      blockers,
      'blocker',
      'ewura-transaction-queue-open',
      'EWURA transaction queue',
      snapshot.queues.ewuraTransactions,
    )
    addOpenQueueIssue(
      blockers,
      'blocker',
      'ewura-report-queue-open',
      'EWURA report queue',
      snapshot.queues.ewuraReports,
    )
    addOpenQueueIssue(
      blockers,
      'blocker',
      'ewura-registration-open',
      'EWURA registration queue',
      snapshot.queues.ewuraRegistration,
    )
  }

  if (targetTransport === 'local_tz') {
    if (!snapshot.traBaseUrlConfigured) {
      blockers.push(
        makeIssue(
          'blocker',
          'tra-base-url-missing',
          'TRA base URL is required before switching to local Tanzania fiscalization.',
        ),
      )
    }
    if (!snapshot.traTokenCredentialsConfigured) {
      blockers.push(
        makeIssue(
          'blocker',
          'tra-token-credentials-missing',
          'TRA username/password token credentials are required before switching to local Tanzania fiscalization.',
        ),
      )
    }
    if (!snapshot.signingKeyConfigured) {
      blockers.push(
        makeIssue(
          'blocker',
          'signing-key-missing',
          'A PEM signing key must be stored in secure artifacts before live local Tanzania fiscalization.',
        ),
      )
    }
    if (!snapshot.certSerialConfigured) {
      warnings.push(
        makeIssue(
          'warning',
          'cert-serial-missing',
          'TRA Cert-Serial is not configured. The runtime can continue only if the certificate artifact can derive the serial value.',
        ),
      )
    }
    if (
      !successfulRegistration(
        snapshot.traRegistrationStatus,
        SUCCESS_TRA_REGISTRATION_STATUSES,
      )
    ) {
      warnings.push(
        makeIssue(
          'warning',
          'tra-registration-not-confirmed',
          `TRA registration status is ${snapshot.traRegistrationStatus || 'not configured'}. Confirm registration before sending live local receipts.`,
        ),
      )
    }
    if (!snapshot.ewuraBaseUrlConfigured) {
      warnings.push(
        makeIssue(
          'warning',
          'ewura-base-url-missing',
          'EWURA base URL is not configured. Sales can be TRA-confirmed, but EWURA submissions will queue/fail until configured.',
        ),
      )
    }
    if (!snapshot.ewuraApiSourceConfigured) {
      warnings.push(
        makeIssue(
          'warning',
          'ewura-api-source-missing',
          'EWURA API source ID is not configured. Confirm it before live EWURA EFPP submission.',
        ),
      )
    }
    if (
      !successfulRegistration(
        snapshot.ewuraRegistrationStatus,
        SUCCESS_EWURA_REGISTRATION_STATUSES,
      )
    ) {
      warnings.push(
        makeIssue(
          'warning',
          'ewura-registration-not-confirmed',
          `EWURA registration status is ${snapshot.ewuraRegistrationStatus || 'not configured'}. Confirm registration before relying on live EWURA posting.`,
        ),
      )
    }
  }

  if (targetTransport === 'proxy' && !snapshot.proxyUrlConfigured) {
    warnings.push(
      makeIssue(
        'warning',
        'proxy-url-missing',
        'Proxy URL is not configured. The station can switch to proxy mode, but the proxy worker cannot submit until proxy_url or the equivalent env-backed config is present.',
      ),
    )
  }

  checklist.push(
    checklistItem(
      'route-valid',
      'Target route is valid for station country and fiscal engine',
      targetTransport === 'local_tz' && !legacyLocalTargetValid
        ? 'block'
        : 'pass',
      targetValidationReason ?? `target=${targetTransport}`,
    ),
    checklistItem(
      'local-queues-drained',
      'Local Tanzania TRA/EWURA queues are drained before local-to-proxy cutover',
      direction === 'local_to_proxy'
        ? snapshot.queues.localTransactions.totalOpen +
            snapshot.queues.localReports.totalOpen +
            snapshot.queues.traZReports.totalOpen +
            snapshot.queues.ewuraTransactions.totalOpen +
            snapshot.queues.ewuraReports.totalOpen +
            snapshot.queues.ewuraRegistration.totalOpen >
          0
          ? 'block'
          : 'pass'
        : 'pass',
    ),
    checklistItem(
      'proxy-queues-drained',
      'Proxy/cloud work is drained before proxy-to-local cutover',
      direction === 'proxy_to_local'
        ? snapshot.eligibleProxyTransactions +
            snapshot.queues.localTransactions.totalOpen +
            snapshot.queues.proxyReports.totalOpen >
          0
          ? 'block'
          : 'pass'
        : 'pass',
    ),
    checklistItem(
      'tra-live-config',
      'TRA endpoint, credentials, and signing key are configured for local mode',
      targetTransport === 'local_tz' &&
        (!snapshot.traBaseUrlConfigured ||
          !snapshot.traTokenCredentialsConfigured ||
          !snapshot.signingKeyConfigured)
        ? 'block'
        : 'pass',
    ),
    checklistItem(
      'ewura-live-config',
      'EWURA endpoint and API source are configured for local mode',
      targetTransport === 'local_tz' &&
        (!snapshot.ewuraBaseUrlConfigured || !snapshot.ewuraApiSourceConfigured)
        ? 'warn'
        : 'pass',
    ),
    checklistItem(
      'proxy-live-config',
      'Proxy/cloud endpoint is configured for proxy mode',
      targetTransport === 'proxy' && !snapshot.proxyUrlConfigured
        ? 'warn'
        : 'pass',
    ),
  )

  return {
    stationId: snapshot.stationId,
    from: currentTransport,
    to: targetTransport,
    direction,
    allowed: blockers.length === 0,
    requiresConfirmation:
      direction !== 'unchanged' && (blockers.length > 0 || warnings.length > 0),
    blockers,
    warnings,
    checklist,
    snapshot,
    evaluatedAt: (args.now ?? new Date()).toISOString(),
  }
}

export function assertTanzaniaRouteSwitchSafety(
  result: TanzaniaRouteSwitchSafetyResult,
) {
  if (result.allowed) return result
  const message = result.blockers.map((issue) => issue.message).join(' ')
  const error = new Error(
    message || 'Fiscalization route switch is blocked by safety checks.',
  ) as Error & {
    status?: number
    routeSwitchSafety?: TanzaniaRouteSwitchSafetyResult
  }
  error.status = 409
  error.routeSwitchSafety = result
  throw error
}

export function buildTanzaniaCloudCutoverChecklist(
  result: TanzaniaRouteSwitchSafetyResult,
): string[] {
  if (result.direction === 'proxy_to_local') {
    return [
      'Confirm the station country is Tanzania and station_settings.fiscalization_engine is TZ.',
      'Drain proxy/cloud fiscalization work and resolve any failed proxy submissions.',
      'Confirm TRA registration is present and the local TRA base URL/token credentials are configured.',
      'Confirm the PEM signing key and certificate serial source are stored as secure artifacts or DB config.',
      'Confirm EWURA registration, endpoint, API source ID, and retry worker are configured.',
      'Switch fiscalization_transport to local_tz only after the safety result has no blockers.',
      'Run a controlled low-value live sale/credit-note validation and capture TRA/EWURA evidence.',
    ]
  }

  if (result.direction === 'local_to_proxy') {
    return [
      'Pause new POS sales or schedule a maintenance window for the cutover.',
      'Drain local TRA transaction queues, TRA z-report queues, and EWURA retry queues.',
      'Confirm no EWURA registration, transaction, or report rows remain pending/processing/failed.',
      'Confirm the proxy/cloud endpoint is configured and the cloud service is ready for Tanzania fiscalization.',
      'Switch fiscalization_transport to proxy only after the safety result has no blockers.',
      'Send a controlled transaction through proxy/cloud and confirm fiscal receipt evidence returns to FTC.',
      'Keep local Tanzania artifacts in place until the first cloud fiscal day closes cleanly.',
    ]
  }

  return [
    'No route change is requested. Keep monitoring queue health before any future route switch.',
  ]
}

export async function loadTanzaniaRouteSwitchSnapshot(
  stationId: string,
): Promise<TanzaniaRouteSwitchSnapshot> {
  const row = await queryOne<Record<string, any>>(
    `WITH station AS (
       SELECT fs.id,
              COALESCE(
                NULLIF(BTRIM(fs.country), ''),
                NULLIF(BTRIM(sc.config_json #>> '{config,country}'), ''),
                NULLIF(BTRIM(sc.config_json #>> '{country}'), '')
              ) AS country,
              ss.fiscalization_engine,
              COALESCE(ss.fiscalization_transport, 'proxy') AS fiscalization_transport,
              NULLIF(BTRIM(ss.proxy_url), '') AS proxy_url
         FROM fuel_stations fs
         LEFT JOIN station_config sc ON sc.station_id = fs.id
         LEFT JOIN station_settings ss ON ss.station_id = fs.id
        WHERE fs.id = $1
        LIMIT 1
     ), local_tx AS (
       SELECT COUNT(*) FILTER (WHERE status = 'PENDING')::int AS pending,
              COUNT(*) FILTER (WHERE status = 'PROCESSING')::int AS processing,
              COUNT(*) FILTER (WHERE status = 'FAILED')::int AS failed,
              COUNT(*) FILTER (
                WHERE status IN ('PENDING', 'FAILED')
                  AND (next_attempt_at IS NULL OR next_attempt_at <= NOW())
              )::int AS ready,
              MIN(created_at) FILTER (WHERE status IN ('PENDING','PROCESSING','FAILED')) AS oldest_open_at,
              (ARRAY_AGG(last_error ORDER BY updated_at DESC) FILTER (WHERE last_error IS NOT NULL))[1] AS last_error
         FROM transaction_queue
        WHERE station_id = $1
     ), local_report AS (
       SELECT COUNT(*) FILTER (WHERE status = 'PENDING')::int AS pending,
              COUNT(*) FILTER (WHERE status = 'PROCESSING')::int AS processing,
              COUNT(*) FILTER (WHERE status = 'FAILED')::int AS failed,
              COUNT(*) FILTER (
                WHERE status IN ('PENDING', 'FAILED')
                  AND (next_attempt_at IS NULL OR next_attempt_at <= NOW())
              )::int AS ready,
              MIN(created_at) FILTER (WHERE status IN ('PENDING','PROCESSING','FAILED')) AS oldest_open_at,
              (ARRAY_AGG(last_error ORDER BY updated_at DESC) FILTER (WHERE last_error IS NOT NULL))[1] AS last_error
         FROM report_queue
        WHERE station_id = $1
     ), ewura_tx AS (
       SELECT COUNT(*) FILTER (WHERE status = 'PENDING')::int AS pending,
              COUNT(*) FILTER (WHERE status = 'PROCESSING')::int AS processing,
              COUNT(*) FILTER (WHERE status = 'FAILED')::int AS failed,
              COUNT(*) FILTER (
                WHERE status IN ('PENDING', 'FAILED')
                  AND (next_attempt_at IS NULL OR next_attempt_at <= NOW())
              )::int AS ready,
              MIN(created_at) FILTER (WHERE status IN ('PENDING','PROCESSING','FAILED')) AS oldest_open_at,
              (ARRAY_AGG(last_error ORDER BY updated_at DESC) FILTER (WHERE last_error IS NOT NULL))[1] AS last_error
         FROM ewura_transactions
        WHERE station_id = $1
     ), ewura_report AS (
       SELECT COUNT(*) FILTER (WHERE status = 'PENDING')::int AS pending,
              COUNT(*) FILTER (WHERE status = 'PROCESSING')::int AS processing,
              COUNT(*) FILTER (WHERE status = 'FAILED')::int AS failed,
              COUNT(*) FILTER (
                WHERE status IN ('PENDING', 'FAILED')
                  AND (next_attempt_at IS NULL OR next_attempt_at <= NOW())
              )::int AS ready,
              MIN(created_at) FILTER (WHERE status IN ('PENDING','PROCESSING','FAILED')) AS oldest_open_at,
              (ARRAY_AGG(last_error ORDER BY updated_at DESC) FILTER (WHERE last_error IS NOT NULL))[1] AS last_error
         FROM ewura_reports
        WHERE station_id = $1
     ), ewura_reg AS (
       SELECT COUNT(*) FILTER (WHERE status IN ('PENDING'))::int AS pending,
              COUNT(*) FILTER (WHERE status = 'PROCESSING')::int AS processing,
              COUNT(*) FILTER (WHERE status = 'FAILED')::int AS failed,
              COUNT(*) FILTER (
                WHERE status IN ('PENDING', 'FAILED')
                  AND (next_attempt_at IS NULL OR next_attempt_at <= NOW())
              )::int AS ready,
              MIN(created_at) FILTER (WHERE status IN ('PENDING','PROCESSING','FAILED')) AS oldest_open_at,
              (ARRAY_AGG(last_error ORDER BY updated_at DESC) FILTER (WHERE last_error IS NOT NULL))[1] AS last_error
         FROM ewura_registration
        WHERE station_id = $1
     ), tra_z AS (
       SELECT COUNT(*) FILTER (WHERE status = 'PENDING')::int AS pending,
              COUNT(*) FILTER (WHERE status = 'PROCESSING')::int AS processing,
              COUNT(*) FILTER (WHERE status = 'FAILED')::int AS failed,
              COUNT(*) FILTER (WHERE status IN ('PENDING', 'FAILED'))::int AS ready,
              MIN(created_at) FILTER (WHERE status IN ('PENDING','PROCESSING','FAILED')) AS oldest_open_at,
              (ARRAY_AGG(payload->>'error' ORDER BY updated_at DESC) FILTER (WHERE payload ? 'error'))[1] AS last_error
         FROM reports
        WHERE station_id = $1
          AND report_type = 'TZ_TRA_Z_REPORT'
     ), proxy_tx AS (
       SELECT COUNT(*) FILTER (WHERE status = 'PENDING')::int AS pending,
              COUNT(*) FILTER (WHERE status = 'PROCESSING')::int AS processing,
              COUNT(*) FILTER (WHERE status = 'FAILED')::int AS failed,
              COUNT(*) FILTER (WHERE status IN ('PENDING', 'FAILED'))::int AS ready,
              MIN(created_at) FILTER (WHERE status IN ('PENDING','PROCESSING','FAILED')) AS oldest_open_at,
              (ARRAY_AGG(last_error ORDER BY updated_at DESC) FILTER (WHERE last_error IS NOT NULL))[1] AS last_error
         FROM transaction_queue
        WHERE station_id = $1
     ), proxy_report AS (
       SELECT COUNT(*) FILTER (WHERE status = 'PENDING')::int AS pending,
              COUNT(*) FILTER (WHERE status = 'PROCESSING')::int AS processing,
              COUNT(*) FILTER (WHERE status = 'FAILED')::int AS failed,
              COUNT(*) FILTER (WHERE status IN ('PENDING', 'FAILED'))::int AS ready,
              MIN(created_at) FILTER (WHERE status IN ('PENDING','PROCESSING','FAILED')) AS oldest_open_at,
              (ARRAY_AGG(last_error ORDER BY updated_at DESC) FILTER (WHERE last_error IS NOT NULL))[1] AS last_error
         FROM report_queue
        WHERE station_id = $1
     ), eligible_proxy AS (
       SELECT COUNT(*)::int AS count
         FROM transactions t
        WHERE t.station_id = $1
          AND t.deleted_at IS NULL
          AND t.cloud_transaction_id IS NULL
          AND (t.fiscalization_reference IS NULL OR BTRIM(t.fiscalization_reference) = '')
          AND t.status IN ('OPEN','ALLOCATED','PENDING','FISCALIZING','FAILED')
     ), fiscal_reg AS (
       SELECT (ARRAY_AGG(status ORDER BY updated_at DESC))[1] AS status,
              (ARRAY_AGG(registration_json ORDER BY updated_at DESC))[1] AS registration_json,
              (ARRAY_AGG(registered_at ORDER BY updated_at DESC))[1] AS registered_at
         FROM fiscal_registration
        WHERE station_id = $1
     ), ewura_reg_status AS (
       SELECT (ARRAY_AGG(status ORDER BY updated_at DESC))[1] AS status,
              (ARRAY_AGG(registration_json ORDER BY updated_at DESC))[1] AS registration_json,
              (ARRAY_AGG(registered_at ORDER BY updated_at DESC))[1] AS registered_at
         FROM ewura_registration
        WHERE station_id = $1
     ), fiscal_config AS (
       SELECT (ARRAY_AGG(config_json ORDER BY updated_at DESC))[1] AS config_json
         FROM fiscal_config
        WHERE station_id = $1
     ), ewura_config AS (
       SELECT (ARRAY_AGG(config_json ORDER BY updated_at DESC))[1] AS config_json
         FROM ewura_config
        WHERE station_id = $1
     ), secure_key AS (
       SELECT COUNT(*)::int AS count
         FROM secure_artifacts
        WHERE station_id = $1
          AND artifact_type = 'cert'
          AND artifact_key IN ('private-key.pem', 'tra-private-key.pem', 'ewura-private-key.pem')
          AND rotated_at IS NULL
          AND deleted_at IS NULL
     )
     SELECT station.country,
            station.fiscalization_engine,
            station.fiscalization_transport,
            station.proxy_url,
            fiscal_reg.status AS tra_registration_status,
            ewura_reg_status.status AS ewura_registration_status,
            secure_key.count > 0 AS signing_key_configured,
            COALESCE(NULLIF(BTRIM(fiscal_config.config_json #>> '{data,certSerial}'), ''), NULLIF(BTRIM(fiscal_config.config_json #>> '{certSerial}'), '')) IS NOT NULL AS cert_serial_configured,
            COALESCE(NULLIF(BTRIM(fiscal_config.config_json #>> '{data,traBaseUrl}'), ''), NULLIF(BTRIM(fiscal_config.config_json #>> '{traBaseUrl}'), ''), NULLIF(BTRIM(fiscal_config.config_json #>> '{data,baseUrl}'), ''), NULLIF(BTRIM(fiscal_config.config_json #>> '{baseUrl}'), '')) IS NOT NULL AS tra_base_url_configured,
            COALESCE(NULLIF(BTRIM(fiscal_reg.registration_json #>> '{data,regData,efdms,efdmsresp,username}'), ''), NULLIF(BTRIM(fiscal_reg.registration_json #>> '{data,regData,efdms,efdmsresp,traUsername}'), ''), NULLIF(BTRIM(fiscal_config.config_json #>> '{data,username}'), ''), NULLIF(BTRIM(fiscal_config.config_json #>> '{username}'), '')) IS NOT NULL
              AND COALESCE(NULLIF(BTRIM(fiscal_reg.registration_json #>> '{data,regData,efdms,efdmsresp,password}'), ''), NULLIF(BTRIM(fiscal_reg.registration_json #>> '{data,regData,efdms,efdmsresp,traPassword}'), ''), NULLIF(BTRIM(fiscal_config.config_json #>> '{data,password}'), ''), NULLIF(BTRIM(fiscal_config.config_json #>> '{password}'), '')) IS NOT NULL AS tra_token_credentials_configured,
            COALESCE(NULLIF(BTRIM(ewura_config.config_json #>> '{data,baseUrl}'), ''), NULLIF(BTRIM(ewura_config.config_json #>> '{baseUrl}'), '')) IS NOT NULL AS ewura_base_url_configured,
            COALESCE(NULLIF(BTRIM(ewura_config.config_json #>> '{data,APISourceId}'), ''), NULLIF(BTRIM(ewura_config.config_json #>> '{APISourceId}'), ''), NULLIF(BTRIM(ewura_config.config_json #>> '{data,apiSourceId}'), ''), NULLIF(BTRIM(ewura_config.config_json #>> '{apiSourceId}'), '')) IS NOT NULL AS ewura_api_source_configured,
            station.proxy_url IS NOT NULL AS proxy_url_configured,
            eligible_proxy.count AS eligible_proxy_transactions,
            local_tx.pending AS local_tx_pending,
            local_tx.processing AS local_tx_processing,
            local_tx.failed AS local_tx_failed,
            local_tx.ready AS local_tx_ready,
            local_tx.oldest_open_at AS local_tx_oldest_open_at,
            local_tx.last_error AS local_tx_last_error,
            local_report.pending AS local_report_pending,
            local_report.processing AS local_report_processing,
            local_report.failed AS local_report_failed,
            local_report.ready AS local_report_ready,
            local_report.oldest_open_at AS local_report_oldest_open_at,
            local_report.last_error AS local_report_last_error,
            proxy_tx.pending AS proxy_tx_pending,
            proxy_tx.processing AS proxy_tx_processing,
            proxy_tx.failed AS proxy_tx_failed,
            proxy_tx.ready AS proxy_tx_ready,
            proxy_tx.oldest_open_at AS proxy_tx_oldest_open_at,
            proxy_tx.last_error AS proxy_tx_last_error,
            proxy_report.pending AS proxy_report_pending,
            proxy_report.processing AS proxy_report_processing,
            proxy_report.failed AS proxy_report_failed,
            proxy_report.ready AS proxy_report_ready,
            proxy_report.oldest_open_at AS proxy_report_oldest_open_at,
            proxy_report.last_error AS proxy_report_last_error,
            ewura_tx.pending AS ewura_tx_pending,
            ewura_tx.processing AS ewura_tx_processing,
            ewura_tx.failed AS ewura_tx_failed,
            ewura_tx.ready AS ewura_tx_ready,
            ewura_tx.oldest_open_at AS ewura_tx_oldest_open_at,
            ewura_tx.last_error AS ewura_tx_last_error,
            ewura_report.pending AS ewura_report_pending,
            ewura_report.processing AS ewura_report_processing,
            ewura_report.failed AS ewura_report_failed,
            ewura_report.ready AS ewura_report_ready,
            ewura_report.oldest_open_at AS ewura_report_oldest_open_at,
            ewura_report.last_error AS ewura_report_last_error,
            ewura_reg.pending AS ewura_reg_pending,
            ewura_reg.processing AS ewura_reg_processing,
            ewura_reg.failed AS ewura_reg_failed,
            ewura_reg.ready AS ewura_reg_ready,
            ewura_reg.oldest_open_at AS ewura_reg_oldest_open_at,
            ewura_reg.last_error AS ewura_reg_last_error,
            tra_z.pending AS tra_z_pending,
            tra_z.processing AS tra_z_processing,
            tra_z.failed AS tra_z_failed,
            tra_z.ready AS tra_z_ready,
            tra_z.oldest_open_at AS tra_z_oldest_open_at,
            tra_z.last_error AS tra_z_last_error
       FROM station,
            local_tx,
            local_report,
            proxy_tx,
            proxy_report,
            ewura_tx,
            ewura_report,
            ewura_reg,
            tra_z,
            eligible_proxy,
            fiscal_reg,
            ewura_reg_status,
            fiscal_config,
            ewura_config,
            secure_key`,
    [stationId],
  )

  if (!row) {
    return {
      stationId,
      country: null,
      fiscalizationEngine: null,
      currentTransport: 'proxy',
      traRegistrationStatus: null,
      ewuraRegistrationStatus: null,
      signingKeyConfigured: false,
      certSerialConfigured: false,
      traBaseUrlConfigured: false,
      traTokenCredentialsConfigured: false,
      ewuraBaseUrlConfigured: false,
      ewuraApiSourceConfigured: false,
      proxyUrlConfigured: false,
      eligibleProxyTransactions: 0,
      queues: {
        localTransactions: zeroQueue(),
        proxyTransactions: zeroQueue(),
        localReports: zeroQueue(),
        proxyReports: zeroQueue(),
        ewuraTransactions: zeroQueue(),
        ewuraReports: zeroQueue(),
        ewuraRegistration: zeroQueue(),
        traZReports: zeroQueue(),
      },
    }
  }

  const currentTransport = normalizeConfiguredFiscalizationTransport(
    row.fiscalization_transport,
  )
  const route = resolveStationFiscalizationRoute({
    stationId,
    country: row.country ?? null,
    fiscalizationEngine: row.fiscalization_engine ?? null,
    fiscalizationTransport: currentTransport,
  })

  return {
    stationId,
    country: text(row.country),
    fiscalizationEngine: text(row.fiscalization_engine),
    currentTransport,
    routeReason: route.reason ?? null,
    traRegistrationStatus: text(row.tra_registration_status),
    ewuraRegistrationStatus: text(row.ewura_registration_status),
    signingKeyConfigured: bool(row.signing_key_configured),
    certSerialConfigured: bool(row.cert_serial_configured),
    traBaseUrlConfigured: bool(row.tra_base_url_configured),
    traTokenCredentialsConfigured: bool(row.tra_token_credentials_configured),
    ewuraBaseUrlConfigured: bool(row.ewura_base_url_configured),
    ewuraApiSourceConfigured: bool(row.ewura_api_source_configured),
    proxyUrlConfigured: bool(row.proxy_url_configured),
    eligibleProxyTransactions: asInt(row.eligible_proxy_transactions),
    queues: {
      localTransactions: queueFromRow('local_tx', row),
      proxyTransactions: queueFromRow('proxy_tx', row),
      localReports: queueFromRow('local_report', row),
      proxyReports: queueFromRow('proxy_report', row),
      ewuraTransactions: queueFromRow('ewura_tx', row),
      ewuraReports: queueFromRow('ewura_report', row),
      ewuraRegistration: queueFromRow('ewura_reg', row),
      traZReports: queueFromRow('tra_z', row),
    },
  }
}

export async function getTanzaniaRouteSwitchSafety(args: {
  stationId: string
  targetTransport: unknown
}) {
  const snapshot = await loadTanzaniaRouteSwitchSnapshot(args.stationId)
  return evaluateTanzaniaRouteSwitchSafety({
    snapshot,
    targetTransport: args.targetTransport,
  })
}

export { OPEN_STATUSES as TANZANIA_ROUTE_SWITCH_OPEN_STATUSES }
