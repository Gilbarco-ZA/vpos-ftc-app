import { requireNonEmptyString, toPositiveInt } from '@/src/shared/utils/inputs'

import { getForecourtAdapterRuntimeDiagnostics } from '@/src/modules/forecourt/application/forecourtAdmin'
import { getClearRejectQuarantineSnapshot } from '@/src/modules/forecourt/infrastructure/jpl/clearRejectQuarantine'
import { getPssReferenceLengthDiagnostics } from '@/src/modules/forecourt/infrastructure/jpl/pssApplicationDiagnostics'

import {
  listForecourtCommandHistory,
  listForecourtEventCounts,
  listForecourtEvents,
  listForecourtTankDeliveryCheckpoints,
  listRecentForecourtEventsByPatterns,
} from '../infrastructure/adminRepo'
import { getDomsMaintenanceExecutionPolicy } from './domsMaintenanceExecutionPolicy'
import { listDomsMaintenanceSessions } from './domsMaintenanceSessions'
import { getAdminForecourtDiagnostics } from './getAdminForecourtDiagnostics'
import { getDomsConfigurationReconciliation } from './getDomsConfigurationReconciliation'
import { getDomsFieldValidationReadiness } from './getDomsFieldValidationReadiness'
import { buildDomsOperationalReadiness } from './getDomsOperationalReadiness'
import { getDomsRuntimeDomainSnapshot } from './getDomsRuntimeDomainSnapshot'
import { getForecourtSyncConfig } from './getForecourtSyncConfig'

export type DomsSupportBundleOptions = {
  eventLimit?: unknown
  includeSamples?: unknown
}

export type DomsSupportMetric = {
  name: string
  value: number
  severity: 'ok' | 'warn' | 'critical'
  description: string
}

const DEFAULT_EVENT_LIMIT = 100
const MAX_EVENT_LIMIT = 500
const MAX_DEPTH = 12

const SENSITIVE_KEY_PATTERN =
  /(password|passwd|secret|token|bearer|authorization|cert|certificate|private.?key|pem|pfx|pin|apikey|api.?key|signature|certkey|routingkey)/i

const asArray = (value: unknown): any[] => (Array.isArray(value) ? value : [])

const asRecord = (value: unknown): Record<string, unknown> => {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>
  }
  return {}
}

const toMs = (value: unknown) => {
  if (value == null || value === '') return null
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  const parsed = new Date(String(value)).getTime()
  return Number.isFinite(parsed) ? parsed : null
}

const ageMs = (value: unknown) => {
  const ts = toMs(value)
  return ts == null ? null : Math.max(0, Date.now() - ts)
}

const countMatchingEventTypes = (
  rows: Array<{ event_type?: string; cnt?: number }>,
  patterns: RegExp[],
) => {
  return rows.reduce((total, row) => {
    const eventType = String(row.event_type ?? '')
    if (!patterns.some((pattern) => pattern.test(eventType))) return total
    return total + Math.max(0, Number(row.cnt ?? 0))
  }, 0)
}

export function redactSupportValue(value: unknown, depth = 0): unknown {
  if (depth > MAX_DEPTH) return '[MaxDepth]'
  if (value == null) return value
  if (typeof value !== 'object') return value
  if (Array.isArray(value)) {
    return value.map((item) => redactSupportValue(item, depth + 1))
  }

  const output: Record<string, unknown> = {}
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (SENSITIVE_KEY_PATTERN.test(key)) {
      output[key] = '[REDACTED]'
      continue
    }
    output[key] = redactSupportValue(child, depth + 1)
  }
  return output
}

const summarizeLatency = (commands: any[]) => {
  const buckets = new Map<
    string,
    { count: number; minMs: number; maxMs: number; totalMs: number }
  >()

  for (const row of commands) {
    const start = toMs(row?.requested_at)
    const end = toMs(row?.result_received_at ?? row?.updated_at)
    if (start == null || end == null || end < start) continue

    const command = String(row?.command ?? 'unknown')
    const latencyMs = end - start
    const current = buckets.get(command) ?? {
      count: 0,
      minMs: latencyMs,
      maxMs: latencyMs,
      totalMs: 0,
    }
    current.count += 1
    current.minMs = Math.min(current.minMs, latencyMs)
    current.maxMs = Math.max(current.maxMs, latencyMs)
    current.totalMs += latencyMs
    buckets.set(command, current)
  }

  return Array.from(buckets.entries())
    .map(([command, bucket]) => ({
      command,
      count: bucket.count,
      minMs: bucket.minMs,
      avgMs: Math.round(bucket.totalMs / Math.max(1, bucket.count)),
      maxMs: bucket.maxMs,
    }))
    .sort((a, b) => b.count - a.count || a.command.localeCompare(b.command))
}

const countStaleBufferLocks = (
  bufferHealth: any,
  staleAfterMs = 30 * 60_000,
) => {
  const now = Date.now()
  const modes = ['supervised', 'unsupervised'] as const
  let stale = 0

  for (const mode of modes) {
    const buckets = Object.values(asRecord(bufferHealth?.[mode]))
    for (const raw of buckets) {
      const item = asRecord(raw)
      const depth = Number(item.depth ?? 0)
      if (depth <= 0) continue
      const lastReadAt = Number(item.lastReadAt ?? 0)
      const lastClearAt = Number(item.lastClearAt ?? 0)
      const lastActivity = Math.max(lastReadAt || 0, lastClearAt || 0)
      if (!lastActivity || now - lastActivity >= staleAfterMs) stale += 1
    }
  }

  return stale
}

export function buildDomsObservabilitySummary(input: {
  diagnostics: any
  eventCounts: Array<{ event_type?: string; cnt?: number }>
  recentCommands: any[]
  recentRejects: any[]
}) {
  const adapterState = asRecord(input.diagnostics?.adapterState)
  const bufferHealth = input.diagnostics?.bufferHealth ?? {}
  const lastMessageAgeMs = ageMs(adapterState.lastMessageAt)
  const lastHeartbeatAgeMs = ageMs(adapterState.lastHeartbeatAt)
  const lastRequestAgeMs = ageMs(adapterState.lastRequestAt)

  const rejectCount = countMatchingEventTypes(input.eventCounts, [/reject/i])
  const missedHeartbeatTimeouts = countMatchingEventTypes(input.eventCounts, [
    /heartbeat.*timeout/i,
    /dead.*connection/i,
    /connection.*timeout/i,
  ])
  const transactionReadFailures = countMatchingEventTypes(input.eventCounts, [
    /trans.*read.*fail/i,
    /transaction.*read.*fail/i,
    /FpSupTrans.*Reject/i,
    /FpUnSupTrans.*Reject/i,
  ])
  const transactionClearFailures = countMatchingEventTypes(input.eventCounts, [
    /clear.*trans.*fail/i,
    /transaction.*clear.*fail/i,
    /clear_Fp.*Trans.*Reject/i,
  ])
  const rawActiveCheckpointClearFailures = Number(
    input.diagnostics?.replay?.metrics?.failedClearCount ?? 0,
  )
  const activeCheckpointClearFailures = Number.isFinite(
    rawActiveCheckpointClearFailures,
  )
    ? Math.max(0, rawActiveCheckpointClearFailures)
    : 0
  const serviceLogBacklog = asArray(adapterState.lastServiceMessages).length
  const borBacklog = asArray(adapterState.lastBackOfficeRecords).length
  const staleLocks = countStaleBufferLocks(bufferHealth)
  const reconnects = Math.max(0, Number(adapterState.reconnectAttempts ?? 0))

  const metrics: DomsSupportMetric[] = [
    {
      name: 'reconnects',
      value: reconnects,
      severity: reconnects > 3 ? 'warn' : 'ok',
      description: 'Current adapter reconnect-attempt counter.',
    },
    {
      name: 'missedHeartbeatTimeouts',
      value: missedHeartbeatTimeouts,
      severity: missedHeartbeatTimeouts > 0 ? 'critical' : 'ok',
      description:
        'Recent heartbeat/dead-connection timeout events from persisted forecourt events.',
    },
    {
      name: 'rejects',
      value: Math.max(rejectCount, input.recentRejects.length),
      severity:
        Math.max(rejectCount, input.recentRejects.length) > 0 ? 'warn' : 'ok',
      description: 'Recent JPL RejectMessage events observed by the adapter.',
    },
    {
      name: 'transactionReadFailures',
      value: transactionReadFailures,
      severity: transactionReadFailures > 0 ? 'critical' : 'ok',
      description: 'Recent transaction read failure/reject signals.',
    },
    {
      name: 'transactionClearFailures',
      value: Math.max(transactionClearFailures, activeCheckpointClearFailures),
      severity:
        Math.max(transactionClearFailures, activeCheckpointClearFailures) > 0
          ? 'critical'
          : 'ok',
      description: 'Recent transaction clear failure/reject signals.',
    },
    {
      name: 'staleLocks',
      value: staleLocks,
      severity: staleLocks > 0 ? 'warn' : 'ok',
      description:
        'Buffer entries with depth but no recent read/clear activity in the stale-lock window.',
    },
    {
      name: 'serviceLogBacklog',
      value: serviceLogBacklog,
      severity: serviceLogBacklog > 0 ? 'warn' : 'ok',
      description:
        'Recently collected service messages retained in adapter diagnostics.',
    },
    {
      name: 'backOfficeRecordBacklog',
      value: borBacklog,
      severity: borBacklog > 0 ? 'warn' : 'ok',
      description:
        'Recently collected back-office records retained in adapter diagnostics.',
    },
  ]

  return {
    generatedAt: new Date().toISOString(),
    status: metrics.some((metric) => metric.severity === 'critical')
      ? 'critical'
      : metrics.some((metric) => metric.severity === 'warn')
        ? 'degraded'
        : 'healthy',
    ages: {
      lastMessageAgeMs,
      lastHeartbeatAgeMs,
      lastRequestAgeMs,
    },
    metrics,
    latency: {
      byCommand: summarizeLatency(input.recentCommands),
      sampleSize: input.recentCommands.length,
    },
  }
}

const buildSettingsSummary = (config: any) => {
  const safeConfig = redactSupportValue(config) as any
  return {
    transport: safeConfig?.transport ?? null,
    jpl: safeConfig?.jpl ?? safeConfig?.doms ?? null,
    forecourt: safeConfig?.forecourt ?? null,
    raw: safeConfig,
  }
}

const summarizeReconciliation = (reconciliation: any) => ({
  severity: reconciliation?.severity ?? null,
  generatedAt: reconciliation?.generatedAt ?? null,
  issueCounts: reconciliation?.issueCounts ?? {},
  issueEntityCounts: reconciliation?.issueEntityCounts ?? {},
  summary: reconciliation?.summary ?? {},
  unresolvedBlockingIssues:
    reconciliation?.remediation?.unresolvedBlockingIssues ?? [],
  suggestionCount:
    reconciliation?.remediation?.suggestions?.length ??
    reconciliation?.summary?.remediationSuggestionCount ??
    0,
})

export async function getDomsSupportBundle(
  stationId: string,
  options: DomsSupportBundleOptions = {},
) {
  const normalizedStationId = requireNonEmptyString(stationId, 'stationId')
  const eventLimit = toPositiveInt(
    options.eventLimit,
    DEFAULT_EVENT_LIMIT,
    MAX_EVENT_LIMIT,
  )
  const includeSamples = options.includeSamples !== false
  const generatedAt = new Date().toISOString()

  const [
    diagnostics,
    settings,
    reconciliation,
    validationReadiness,
    domainSnapshot,
    maintenanceSessions,
    maintenanceExecutionPolicy,
    eventCounts,
    recentEvents,
    recentJplEvents,
    recentRejects,
    recentCommands,
    deliveryCheckpoints,
    pssReferenceLengthDiagnostics,
  ] = await Promise.all([
    getAdminForecourtDiagnostics(normalizedStationId),
    getForecourtSyncConfig(normalizedStationId),
    getDomsConfigurationReconciliation(normalizedStationId),
    getDomsFieldValidationReadiness(normalizedStationId),
    getDomsRuntimeDomainSnapshot(normalizedStationId),
    listDomsMaintenanceSessions(
      normalizedStationId,
      new URLSearchParams({ limit: '20' }),
    ),
    getDomsMaintenanceExecutionPolicy(normalizedStationId),
    listForecourtEventCounts(normalizedStationId),
    includeSamples
      ? listForecourtEvents({
          stationId: normalizedStationId,
          source: null,
          eventType: null,
          pumpId: null,
          action: null,
          limit: eventLimit,
        })
      : Promise.resolve([]),
    includeSamples
      ? listForecourtEvents({
          stationId: normalizedStationId,
          source: 'jpl_tcp',
          eventType: null,
          pumpId: null,
          action: null,
          limit: Math.min(eventLimit, 100),
        })
      : Promise.resolve([]),
    listRecentForecourtEventsByPatterns({
      stationId: normalizedStationId,
      source: 'jpl_tcp',
      patterns: ['RejectMessage%'],
      limit: Math.min(eventLimit, 100),
    }),
    listForecourtCommandHistory({
      stationId: normalizedStationId,
      limit: Math.min(eventLimit, 200),
    }),
    listForecourtTankDeliveryCheckpoints({
      stationId: normalizedStationId,
      limit: 100,
    }),
    getPssReferenceLengthDiagnostics(normalizedStationId),
  ])

  const { adapterState, bufferHealth } = getForecourtAdapterRuntimeDiagnostics()
  const operationalReadiness = buildDomsOperationalReadiness({
    stationId: normalizedStationId,
    generatedAt,
    domainSnapshot,
    fieldValidation: validationReadiness,
  })
  const observability = buildDomsObservabilitySummary({
    diagnostics: { ...diagnostics, adapterState, bufferHealth },
    eventCounts,
    recentCommands,
    recentRejects,
  })

  return redactSupportValue({
    bundleType: 'doms-jpl-support-bundle',
    bundleVersion: 1,
    stationId: normalizedStationId,
    generatedAt,
    safetyNotice:
      'This support bundle is diagnostic only. It does not authorize DOMS/PSS write execution and intentionally redacts secrets, certificates, tokens, and signatures.',
    settings: buildSettingsSummary(settings),
    observability,
    connection: diagnostics.connection,
    protocol: {
      adapterState,
      bufferHealth,
      protocolHealth:
        (adapterState as any)?.protocolHealth ??
        (diagnostics as any)?.protocolHealth ??
        null,
      lastFrameDiagnostic:
        (adapterState as any)?.lastFrameDiagnostic ??
        (diagnostics as any)?.lastFrameDiagnostic ??
        null,
      frameDiagnostics:
        (adapterState as any)?.frameDiagnostics ??
        (diagnostics as any)?.recentFrameDiagnostics ??
        [],
      lastWireDiagnostic: (adapterState as any)?.lastWireDiagnostic ?? null,
      wireDiagnostics: (adapterState as any)?.wireDiagnostics ?? [],
      clearRejectQuarantine:
        getClearRejectQuarantineSnapshot(normalizedStationId),
      pssReferenceLengthDiagnostics,
    },
    transactions: diagnostics.transactions,
    replay: diagnostics.replay,
    payloadLifecycle: diagnostics.payloadLifecycle ?? null,
    reconciliation: {
      summary: summarizeReconciliation(reconciliation),
      detail: reconciliation,
    },
    validationReadiness,
    operationalReadiness,
    maintenance: {
      sessions: maintenanceSessions,
      executionPolicy: maintenanceExecutionPolicy,
    },
    samples: includeSamples
      ? {
          eventCounts,
          recentEvents,
          recentJplEvents,
          recentRejects,
          recentCommands,
          deliveryCheckpoints,
          recentProtocolEvents: diagnostics.recent?.protocolEvents ?? [],
        }
      : {
          eventCounts,
          recentRejects,
        },
  })
}

export function buildDomsSupportBundleFilename(
  stationId: string,
  generatedAt = new Date().toISOString(),
) {
  const station = requireNonEmptyString(stationId, 'stationId')
    .trim()
    .replaceAll(' ', '-')
    .split('')
    .filter((char) => {
      const code = char.charCodeAt(0)
      const isNumber = code >= 48 && code <= 57
      const isUpperAlpha = code >= 65 && code <= 90
      const isLowerAlpha = code >= 97 && code <= 122
      return (
        isNumber ||
        isUpperAlpha ||
        isLowerAlpha ||
        char === '_' ||
        char === '.' ||
        char === '-'
      )
    })
    .join('')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)

  const timestamp = generatedAt
    .replaceAll('-', '')
    .replaceAll(':', '')
    .replaceAll('.', '')

  return `doms-support-${station || 'station'}-${timestamp}.json`
}
