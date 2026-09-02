'use client'

import { useCallback, useEffect, useState } from 'react'

import { api } from '@/src/shared/api/fetch'
import { STATUS_VARIANT } from '@/src/shared/status/ui'

import { CollapsibleStatusSection } from '@/components/admin/forecourt/CollapsibleStatusSection'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

const fmtTs = (value: unknown) => {
  if (value == null || value === '') return '—'
  const ts =
    typeof value === 'number' ? value : new Date(String(value)).getTime()
  if (!Number.isFinite(ts)) return String(value)
  return new Date(ts).toLocaleString()
}

const severityVariant = (severity: unknown) => {
  switch (String(severity ?? '').toLowerCase()) {
    case 'ok':
      return STATUS_VARIANT.SUCCESS
    case 'error':
      return STATUS_VARIANT.ERROR
    case 'warning':
      return STATUS_VARIANT.NEUTRAL
    default:
      return STATUS_VARIANT.INFO
  }
}

const valueOrDash = (value: unknown) => {
  const text = String(value ?? '').trim()
  return text || '—'
}

const firstDefined = (...values: unknown[]) =>
  values.find((value) => value !== undefined && value !== null && value !== '')

function SummaryMetric({ label, value }: { label: string; value: unknown }) {
  return (
    <div className="rounded border bg-[var(--surface-card)] p-3">
      <div className="text-xs uppercase tracking-wide text-[var(--text-muted)]">
        {label}
      </div>
      <div className="mt-1 break-words text-lg font-semibold text-[var(--text-primary)]">
        {valueOrDash(value)}
      </div>
    </div>
  )
}

type ApplyMappingPayload = {
  entityType: 'pump' | 'tank' | 'nozzle'
  entityId: string
  mapping: Record<string, unknown>
  sourceSuggestionCode?: string
}

const buildApplyMappingPayload = (
  suggestion: any,
): ApplyMappingPayload | null => {
  const value = suggestion?.suggestedValue ?? {}
  const entityType = String(suggestion?.entityType ?? '').toLowerCase()
  const entityId =
    suggestion?.entityId != null ? String(suggestion.entityId) : ''
  const code =
    typeof suggestion?.code === 'string' ? suggestion.code : undefined

  if (value?.pump_id && value?.doms_fp_id != null) {
    return {
      entityType: 'pump',
      entityId: String(value.pump_id),
      mapping: { domsFpId: value.doms_fp_id },
      sourceSuggestionCode: code,
    }
  }

  if (entityType === 'pump' && entityId && value?.doms_fp_id != null) {
    return {
      entityType: 'pump',
      entityId,
      mapping: { domsFpId: value.doms_fp_id },
      sourceSuggestionCode: code,
    }
  }

  if (value?.tank_id && value?.doms_tank_id != null) {
    return {
      entityType: 'tank',
      entityId: String(value.tank_id),
      mapping: { domsTankId: value.doms_tank_id },
      sourceSuggestionCode: code,
    }
  }

  if (entityType === 'tank' && entityId && value?.doms_tank_id != null) {
    return {
      entityType: 'tank',
      entityId,
      mapping: { domsTankId: value.doms_tank_id },
      sourceSuggestionCode: code,
    }
  }

  if (entityType === 'nozzle' && entityId) {
    const mapping: Record<string, unknown> = {}
    if (value?.doms_grade_option_id != null) {
      mapping.domsGradeOptionId = value.doms_grade_option_id
    }
    if (value?.doms_grade_id != null) mapping.domsGradeId = value.doms_grade_id
    if (value?.doms_tank_id != null) mapping.domsTankId = value.doms_tank_id

    if (Object.keys(mapping).length > 0) {
      return {
        entityType: 'nozzle',
        entityId,
        mapping,
        sourceSuggestionCode: code,
      }
    }
  }

  return null
}

const BULK_CSV_HEADERS = [
  'entityType',
  'entityId',
  'domsFpId',
  'domsTankId',
  'domsGradeOptionId',
  'domsGradeId',
  'sourceSuggestionCode',
  'note',
]

const escapeCsvValue = (value: unknown) => {
  const text = String(value ?? '')
  if (!/[",\n\r]/.test(text)) return text
  return `"${text.replaceAll('"', '""')}"`
}

const rowsToCsv = (rows: unknown[][]) =>
  [BULK_CSV_HEADERS, ...rows]
    .map((row) => row.map(escapeCsvValue).join(','))
    .join('\n') + '\n'

function JsonPreview({ value }: { value: unknown }) {
  return (
    <pre className="max-h-28 overflow-auto rounded bg-[var(--surface-muted)] p-2 text-[11px]">
      {JSON.stringify(value ?? {}, null, 2)}
    </pre>
  )
}

export function JplReconciliationPanel() {
  const [payload, setPayload] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [csrfToken, setCsrfToken] = useState('')
  const [confirmedPhysicalMapping, setConfirmedPhysicalMapping] =
    useState(false)
  const [confirmationNote, setConfirmationNote] = useState('')
  const [applyingKey, setApplyingKey] = useState('')
  const [applyMessage, setApplyMessage] = useState('')
  const [mappingHistory, setMappingHistory] = useState<any[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [confirmedRollback, setConfirmedRollback] = useState(false)
  const [rollingBackId, setRollingBackId] = useState('')
  const [bulkCsvText, setBulkCsvText] = useState('')
  const [bulkJsonText, setBulkJsonText] = useState('')
  const [bulkResult, setBulkResult] = useState<any>(null)
  const [bulkLoading, setBulkLoading] = useState(false)
  const [confirmedBulkLive, setConfirmedBulkLive] = useState(false)
  const [confirmedBulkApply, setConfirmedBulkApply] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const response = await api<any>('/api/admin/forecourt/reconciliation')
      if (!response.success) {
        throw new Error(response.error || 'Failed to load reconciliation')
      }
      setPayload(response.data ?? null)
    } catch (err: any) {
      setError(err?.message || 'Failed to load reconciliation')
    } finally {
      setLoading(false)
    }
  }, [])

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true)
    try {
      const response = await api<any>(
        '/api/admin/forecourt/reconciliation/history?limit=25',
      )
      if (!response.success) {
        throw new Error(response.error || 'Failed to load mapping history')
      }
      setMappingHistory(response.data?.history ?? [])
    } catch (err: any) {
      setError(err?.message || 'Failed to load mapping history')
    } finally {
      setHistoryLoading(false)
    }
  }, [])

  useEffect(() => {
    queueMicrotask(() => {
      void load()
    })
    queueMicrotask(() => {
      void loadHistory()
    })
    fetch('/api/security/csrf', { cache: 'no-store' })
      .then((response) => response.json())
      .then((data) => {
        if (typeof data?.token === 'string') setCsrfToken(data.token)
      })
      .catch(() => setCsrfToken(''))
  }, [load, loadHistory])

  const issues = payload?.issues ?? []
  const pumps = payload?.ftc?.pumps ?? []
  const nozzles = payload?.ftc?.nozzles ?? []
  const tanks = payload?.ftc?.tanks ?? []
  const installGroups = payload?.doms?.installGroups ?? []
  const observedFpIds = payload?.summary?.observedDomsFpIds ?? []
  const observedTgIds = payload?.summary?.observedDomsTgIds ?? []
  const observedTankIds = payload?.summary?.observedDomsTankIds ?? []
  const suggestions = payload?.remediation?.suggestions ?? []
  const safetyNotice = payload?.remediation?.safetyNotice ?? ''

  const topIssues = issues.slice(0, 12)
  const topSuggestions = suggestions.slice(0, 12)

  const exportReconciliation = () => {
    window.open(
      '/api/admin/forecourt/reconciliation/export',
      '_blank',
      'noopener,noreferrer',
    )
  }

  const applyMapping = async (suggestion: any) => {
    const payloadToApply = buildApplyMappingPayload(suggestion)
    if (!payloadToApply) return

    setApplyingKey(
      `${payloadToApply.entityType}:${payloadToApply.entityId}:${suggestion.code}`,
    )
    setApplyMessage('')
    setError('')

    try {
      const response = await api<any>(
        '/api/admin/forecourt/reconciliation/apply',
        {
          method: 'POST',
          headers: csrfToken ? { 'x-csrf-token': csrfToken } : {},
          body: JSON.stringify({
            ...payloadToApply,
            confirmPhysicalMapping: confirmedPhysicalMapping,
            confirmationNote,
            csrf_token: csrfToken,
          }),
        },
      )

      if (!response.success) {
        throw new Error(response.error || 'Failed to apply mapping')
      }

      setPayload(response.data?.reconciliation ?? payload)
      setApplyMessage(
        'FTC mapping updated. No DOMS/PSS install command was sent.',
      )
      void loadHistory()
    } catch (err: any) {
      setError(err?.message || 'Failed to apply mapping')
    } finally {
      setApplyingKey('')
    }
  }

  const downloadBulkTemplate = () => {
    window.open(
      '/api/admin/forecourt/reconciliation/bulk?template=csv',
      '_blank',
      'noopener,noreferrer',
    )
  }

  const loadCurrentSiteTemplate = () => {
    const rows: unknown[][] = []
    for (const pump of pumps) {
      rows.push([
        'pump',
        pump.id,
        firstDefined(pump.domsFpId, pump.doms_fp_id) ?? '',
        '',
        '',
        '',
        'site-template',
        `Pump ${firstDefined(pump.pump_number, pump.pumpNumber, pump.code, pump.id)} - verify against PSS Configurator`,
      ])
    }
    for (const tank of tanks) {
      rows.push([
        'tank',
        tank.id,
        '',
        firstDefined(tank.domsTankId, tank.doms_tank_id) ?? '',
        '',
        '',
        'site-template',
        `Tank ${firstDefined(tank.code, tank.name, tank.id)} - verify against tank gauge assignment`,
      ])
    }
    for (const nozzle of nozzles) {
      rows.push([
        'nozzle',
        nozzle.id,
        '',
        firstDefined(nozzle.domsTankId, nozzle.doms_tank_id) ?? '',
        firstDefined(nozzle.domsGradeOptionId, nozzle.doms_grade_option_id) ??
          '',
        firstDefined(nozzle.domsGradeId, nozzle.doms_grade_id) ?? '',
        'site-template',
        `Pump ${firstDefined(nozzle.pump_number, nozzle.pumpNumber, nozzle.pump_code, '—')} nozzle ${firstDefined(nozzle.nozzle_number, nozzle.nozzleNumber, '—')}`,
      ])
    }
    setBulkCsvText(rowsToCsv(rows))
    setBulkJsonText('')
    setBulkResult(null)
  }

  const loadSuggestedMappingsTemplate = () => {
    const rows = suggestions
      .map((suggestion: any) => {
        const apply = buildApplyMappingPayload(suggestion)
        if (!apply) return null
        return [
          apply.entityType,
          apply.entityId,
          apply.mapping.domsFpId ?? '',
          apply.mapping.domsTankId ?? '',
          apply.mapping.domsGradeOptionId ?? '',
          apply.mapping.domsGradeId ?? '',
          apply.sourceSuggestionCode ??
            suggestion.code ??
            'reconciliation-suggestion',
          suggestion.title ??
            suggestion.description ??
            'Review against physical site',
        ]
      })
      .filter(Boolean) as unknown[][]

    setBulkCsvText(rowsToCsv(rows))
    setBulkJsonText('')
    setBulkResult(null)
  }

  const importBulkCsvFile = async (file: File | null) => {
    if (!file) return
    const text = await file.text()
    setBulkCsvText(text)
    setBulkJsonText('')
    setBulkResult(null)
  }

  const submitBulkMapping = async (mode: 'dry-run' | 'apply') => {
    setBulkLoading(true)
    setApplyMessage('')
    setError('')

    try {
      const response = await api<any>(
        '/api/admin/forecourt/reconciliation/bulk',
        {
          method: 'POST',
          headers: csrfToken ? { 'x-csrf-token': csrfToken } : {},
          body: JSON.stringify({
            mode,
            csvText: bulkCsvText,
            jsonText: bulkJsonText,
            confirmPhysicalMapping: confirmedPhysicalMapping,
            confirmLivePreValidation: confirmedBulkLive,
            confirmBulkApply: confirmedBulkApply,
            confirmationNote,
            csrf_token: csrfToken,
          }),
        },
      )

      if (!response.success) {
        throw new Error(response.error || 'Failed to process bulk mapping')
      }

      setBulkResult(response.data ?? null)
      if (mode === 'apply') {
        setPayload(response.data?.reconciliationAfterApply ?? payload)
        setApplyMessage(
          `Bulk FTC mapping update applied (${response.data?.applied?.length ?? 0} rows). No DOMS/PSS command was sent.`,
        )
        void loadHistory()
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to process bulk mapping')
    } finally {
      setBulkLoading(false)
    }
  }

  const rollbackMapping = async (entry: any) => {
    const auditLogId = typeof entry?.id === 'string' ? entry.id : ''
    if (!auditLogId) return

    setRollingBackId(auditLogId)
    setApplyMessage('')
    setError('')

    try {
      const response = await api<any>(
        '/api/admin/forecourt/reconciliation/rollback',
        {
          method: 'POST',
          headers: csrfToken ? { 'x-csrf-token': csrfToken } : {},
          body: JSON.stringify({
            auditLogId,
            confirmRollback: confirmedRollback,
            confirmationNote,
            csrf_token: csrfToken,
          }),
        },
      )

      if (!response.success) {
        throw new Error(response.error || 'Failed to rollback mapping')
      }

      setPayload(response.data?.reconciliation ?? payload)
      setMappingHistory(response.data?.history?.history ?? mappingHistory)
      setApplyMessage(
        'FTC mapping rolled back. No DOMS/PSS install command was sent.',
      )
    } catch (err: any) {
      setError(err?.message || 'Failed to rollback mapping')
    } finally {
      setRollingBackId('')
    }
  }

  return (
    <CollapsibleStatusSection
      title="DOMS configuration reconciliation"
      status={String(payload?.severity ?? 'unknown').toUpperCase()}
      statusVariant={severityVariant(payload?.severity)}
      contentClassName="p-4 pt-0"
    >
      <div className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-base font-semibold">
              DOMS configuration reconciliation
            </div>
            <p className="text-sm text-[var(--text-secondary)]">
              Compare FTC mappings with the latest DOMS/JPL snapshots, then
              apply or roll back FTC-side mapping changes only.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={severityVariant(payload?.severity)}>
              {String(payload?.severity ?? 'unknown').toUpperCase()}
            </Badge>
            <Button
              type="button"
              variant="secondary"
              onClick={exportReconciliation}
            >
              Export JSON
            </Button>
            <Button type="button" onClick={load} disabled={loading}>
              {loading ? 'Refreshing...' : 'Refresh reconciliation'}
            </Button>
          </div>
        </div>

        {error ? (
          <div className="rounded border border-red-500/30 bg-red-500/5 p-3 text-sm text-red-700">
            {error}
          </div>
        ) : null}

        {applyMessage ? (
          <div className="rounded border border-green-500/30 bg-green-500/5 p-3 text-sm text-green-700">
            {applyMessage}
          </div>
        ) : null}

        <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
          <SummaryMetric
            label="Configured pumps"
            value={payload?.summary?.configuredPumps}
          />
          <SummaryMetric
            label="Configured nozzles"
            value={payload?.summary?.configuredNozzles}
          />
          <SummaryMetric
            label="Configured tanks"
            value={payload?.summary?.configuredTanks}
          />
          <SummaryMetric label="Issues" value={issues.length} />
          <SummaryMetric label="Observed FpIds" value={observedFpIds.length} />
          <SummaryMetric label="Observed TgIds" value={observedTgIds.length} />
          <SummaryMetric
            label="Observed TankIds"
            value={observedTankIds.length}
          />
          <SummaryMetric
            label="Suggestions"
            value={payload?.summary?.remediationSuggestionCount}
          />
          <SummaryMetric
            label="Blocking issues"
            value={payload?.summary?.unresolvedBlockingIssueCount}
          />
          <SummaryMetric
            label="Install status"
            value={fmtTs(payload?.summary?.installStatusSeenAt)}
          />
          <SummaryMetric
            label="Mapping changes"
            value={mappingHistory.length}
          />
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="rounded border bg-[var(--surface-card)] p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <div className="text-sm font-semibold">Mapping issues</div>
              <div className="flex gap-2">
                <Badge variant={STATUS_VARIANT.ERROR}>
                  {payload?.issueCounts?.error ?? 0} errors
                </Badge>
                <Badge variant={STATUS_VARIANT.NEUTRAL}>
                  {payload?.issueCounts?.warning ?? 0} warnings
                </Badge>
              </div>
            </div>
            {topIssues.length ? (
              <div className="space-y-2">
                {topIssues.map((issue: any, index: number) => (
                  <div
                    key={`${issue.code}-${index}`}
                    className="border-b pb-2 text-sm last:border-b-0"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={severityVariant(issue.severity)}>
                        {issue.severity}
                      </Badge>
                      <span className="font-medium">{issue.code}</span>
                      {issue.entityId ? (
                        <span className="text-xs text-[var(--text-muted)]">
                          {issue.entityType}:{String(issue.entityId)}
                        </span>
                      ) : null}
                    </div>
                    <div className="mt-1 text-[var(--text-secondary)]">
                      {issue.message}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-sm text-[var(--text-secondary)]">
                No reconciliation issues found from the currently available
                snapshots.
              </div>
            )}
          </div>

          <div className="rounded border bg-[var(--surface-card)] p-3">
            <div className="mb-2 text-sm font-semibold">
              Latest DOMS install groups
            </div>
            {installGroups.length ? (
              <div className="space-y-2">
                {installGroups.map((group: any, index: number) => (
                  <div
                    key={`${group.code ?? 'group'}-${index}`}
                    className="flex flex-wrap items-center justify-between gap-2 border-b pb-2 text-xs last:border-b-0"
                  >
                    <div>
                      <div className="font-medium">
                        {group.code ?? 'Unknown code'}
                      </div>
                      <div className="text-[var(--text-secondary)]">
                        {(group.deviceIds ?? []).join(', ') || 'No device IDs'}
                      </div>
                    </div>
                    <Badge variant={STATUS_VARIANT.INFO}>
                      {(group.deviceIds ?? []).length}
                    </Badge>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-sm text-[var(--text-secondary)]">
                No install groups recorded yet.
              </div>
            )}
          </div>
        </div>

        <CollapsibleStatusSection
          title="FTC-side remediation suggestions"
          status={`${suggestions.length} suggestions`}
          statusVariant={
            suggestions.length ? STATUS_VARIANT.NEUTRAL : STATUS_VARIANT.SUCCESS
          }
          contentClassName="p-3 pt-0"
        >
          <div className="rounded border bg-[var(--surface-card)] p-3">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="text-sm font-semibold">
                  FTC-side remediation suggestions
                </div>
                <div className="text-xs text-[var(--text-secondary)]">
                  Suggestions may update FTC mappings after confirmation, but no
                  DOMS install command is sent.
                </div>
              </div>
              <Badge variant={STATUS_VARIANT.INFO}>
                {suggestions.length} suggestions
              </Badge>
            </div>
            {safetyNotice ? (
              <div className="mb-3 rounded border border-amber-500/30 bg-amber-500/5 p-2 text-xs text-amber-800">
                {safetyNotice}
              </div>
            ) : null}

            <div className="mb-3 grid grid-cols-1 gap-2 rounded border bg-[var(--surface-muted)] p-3 text-xs md:grid-cols-[1fr_2fr]">
              <label className="flex items-start gap-2 text-[var(--text-secondary)]">
                <input
                  type="checkbox"
                  checked={confirmedPhysicalMapping}
                  onChange={(event) =>
                    setConfirmedPhysicalMapping(event.target.checked)
                  }
                  className="mt-0.5"
                />
                <span>
                  I have checked the selected mapping against the physical site
                  and PSS Configurator.
                </span>
              </label>
              <textarea
                value={confirmationNote}
                onChange={(event) => setConfirmationNote(event.target.value)}
                placeholder="Optional confirmation note, for example: checked against dispenser labels and PSS Configurator export."
                className="min-h-16 rounded border bg-[var(--surface-card)] p-2 text-xs text-[var(--text-primary)]"
              />
            </div>
            {topSuggestions.length ? (
              <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
                {topSuggestions.map((suggestion: any, index: number) => {
                  const applyPayload = buildApplyMappingPayload(suggestion)
                  const applyKey = applyPayload
                    ? `${applyPayload.entityType}:${applyPayload.entityId}:${suggestion.code}`
                    : ''
                  return (
                    <div
                      key={`${suggestion.code}-${index}`}
                      className="rounded border p-3 text-sm"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant={severityVariant(suggestion.severity)}>
                          {suggestion.severity}
                        </Badge>
                        <Badge variant={STATUS_VARIANT.NEUTRAL}>
                          {suggestion.confidence} confidence
                        </Badge>
                        <span className="font-medium">{suggestion.title}</span>
                      </div>
                      <div className="mt-2 text-[var(--text-secondary)]">
                        {suggestion.description}
                      </div>
                      <div className="mt-2 text-xs text-[var(--text-muted)]">
                        {suggestion.suggestedAction}
                      </div>
                      {suggestion.suggestedValue ? (
                        <JsonPreview value={suggestion.suggestedValue} />
                      ) : null}
                      {applyPayload ? (
                        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded border bg-[var(--surface-muted)] p-2">
                          <div className="text-xs text-[var(--text-secondary)]">
                            Applies to FTC {applyPayload.entityType} mapping
                            only. No DOMS command will be sent.
                          </div>
                          <Button
                            type="button"
                            size="sm"
                            variant="secondary"
                            disabled={
                              !csrfToken ||
                              !confirmedPhysicalMapping ||
                              applyingKey === applyKey
                            }
                            onClick={() => applyMapping(suggestion)}
                          >
                            {applyingKey === applyKey
                              ? 'Applying...'
                              : 'Apply FTC mapping'}
                          </Button>
                        </div>
                      ) : null}
                    </div>
                  )
                })}
              </div>
            ) : (
              <div className="text-sm text-[var(--text-secondary)]">
                No remediation suggestions are available for the current
                snapshot.
              </div>
            )}
          </div>
        </CollapsibleStatusSection>

        <CollapsibleStatusSection
          title="Bulk FTC-side mapping review/apply"
          status={bulkResult ? 'reviewed' : 'not reviewed'}
          statusVariant={
            bulkResult ? STATUS_VARIANT.SUCCESS : STATUS_VARIANT.INFO
          }
          contentClassName="p-3 pt-0"
        >
          <div className="rounded border bg-[var(--surface-card)] p-3">
            <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="text-sm font-semibold">
                  Bulk FTC-side mapping review/apply
                </div>
                <div className="text-xs text-[var(--text-secondary)]">
                  Start from the current site entities or the reconciliation
                  suggestions, complete the DOMS IDs, then run a safe dry-run
                  before applying FTC-side mappings.
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={loadCurrentSiteTemplate}
                >
                  Load current site template
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  disabled={suggestions.length === 0}
                  onClick={loadSuggestedMappingsTemplate}
                >
                  Load suggested corrections
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={downloadBulkTemplate}
                >
                  Download blank CSV
                </Button>
              </div>
            </div>

            <div className="mb-3 grid grid-cols-1 gap-2 rounded border bg-[var(--surface-muted)] p-3 text-xs md:grid-cols-3">
              <div>
                <div className="font-semibold">1. Prepare</div>
                <div className="mt-1 text-[var(--text-secondary)]">
                  Load site rows, use suggested corrections, or upload a
                  completed CSV from the technician.
                </div>
              </div>
              <div>
                <div className="font-semibold">2. Dry-run</div>
                <div className="mt-1 text-[var(--text-secondary)]">
                  Validate UUIDs, duplicates, conflicts, and observed DOMS IDs
                  without changing the database.
                </div>
              </div>
              <div>
                <div className="font-semibold">3. Apply</div>
                <div className="mt-1 text-[var(--text-secondary)]">
                  Confirm the physical mapping and apply only after the dry-run
                  is ready. No PSS command is sent.
                </div>
              </div>
            </div>

            <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded border p-3">
              <label className="text-xs font-medium">
                Upload completed CSV
                <input
                  type="file"
                  accept=".csv,text/csv"
                  className="ml-3 text-xs"
                  onChange={(event) =>
                    void importBulkCsvFile(event.target.files?.[0] ?? null)
                  }
                />
              </label>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  disabled={
                    !csrfToken ||
                    bulkLoading ||
                    (!bulkCsvText.trim() && !bulkJsonText.trim())
                  }
                  onClick={() => submitBulkMapping('dry-run')}
                >
                  {bulkLoading ? 'Reviewing...' : 'Dry-run batch'}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  disabled={
                    !csrfToken ||
                    bulkLoading ||
                    !confirmedPhysicalMapping ||
                    !confirmedBulkLive ||
                    !confirmedBulkApply ||
                    bulkResult?.ok !== true
                  }
                  onClick={() => submitBulkMapping('apply')}
                >
                  {bulkLoading ? 'Applying...' : 'Apply reviewed batch'}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setBulkCsvText('')
                    setBulkJsonText('')
                    setBulkResult(null)
                  }}
                >
                  Clear
                </Button>
              </div>
            </div>

            <div className="mb-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-[var(--text-secondary)]">
                  CSV rows
                </label>
                <textarea
                  value={bulkCsvText}
                  onChange={(event) => {
                    setBulkCsvText(event.target.value)
                    setBulkResult(null)
                  }}
                  placeholder="entityType,entityId,domsFpId,domsTankId,domsGradeOptionId,domsGradeId,sourceSuggestionCode,note"
                  className="min-h-32 w-full rounded border bg-[var(--surface-muted)] p-2 font-mono text-xs text-[var(--text-primary)]"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-[var(--text-secondary)]">
                  JSON rows
                </label>
                <textarea
                  value={bulkJsonText}
                  onChange={(event) => {
                    setBulkJsonText(event.target.value)
                    setBulkResult(null)
                  }}
                  placeholder='[{"entityType":"pump","entityId":"...","domsFpId":1}]'
                  className="min-h-32 w-full rounded border bg-[var(--surface-muted)] p-2 font-mono text-xs text-[var(--text-primary)]"
                />
              </div>
            </div>

            <div className="mb-3 grid grid-cols-1 gap-2 rounded border bg-[var(--surface-muted)] p-3 text-xs md:grid-cols-2">
              <label className="flex items-start gap-2 text-[var(--text-secondary)]">
                <input
                  type="checkbox"
                  checked={confirmedBulkLive}
                  onChange={(event) =>
                    setConfirmedBulkLive(event.target.checked)
                  }
                  className="mt-0.5"
                />
                <span>
                  I refreshed reconciliation against live DOMS/PSS data and
                  checked that the batch matches the latest observed controller
                  IDs.
                </span>
              </label>
              <label className="flex items-start gap-2 text-[var(--text-secondary)]">
                <input
                  type="checkbox"
                  checked={confirmedBulkApply}
                  onChange={(event) =>
                    setConfirmedBulkApply(event.target.checked)
                  }
                  className="mt-0.5"
                />
                <span>
                  I understand this applies all reviewed rows as FTC-side
                  mapping changes only and sends no DOMS/PSS write command.
                </span>
              </label>
            </div>

            {bulkResult ? (
              <div className="space-y-3 rounded border bg-[var(--surface-muted)] p-3 text-xs">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge
                    variant={
                      bulkResult.ok
                        ? STATUS_VARIANT.SUCCESS
                        : STATUS_VARIANT.ERROR
                    }
                  >
                    {bulkResult.ok ? 'READY' : 'BLOCKED'}
                  </Badge>
                  <span>
                    {bulkResult.summary?.itemCount ?? 0} rows,{' '}
                    {bulkResult.summary?.blockerCount ?? 0} blockers,{' '}
                    {bulkResult.summary?.warningCount ?? 0} warnings
                  </span>
                  <span className="text-[var(--text-muted)]">
                    Reconciliation:{' '}
                    {valueOrDash(bulkResult.reconciliation?.severity)}
                  </span>
                </div>

                {bulkResult.blockers?.length ? (
                  <div>
                    <div className="mb-1 font-semibold text-red-700">
                      Blockers
                    </div>
                    <div className="space-y-1">
                      {bulkResult.blockers.map(
                        (blocker: any, index: number) => (
                          <div
                            key={`${blocker.code}-${index}`}
                            className="rounded border border-red-500/30 bg-red-500/5 p-2 text-red-800"
                          >
                            {blocker.sourceLine
                              ? `Line ${blocker.sourceLine}: `
                              : ''}
                            {blocker.message}
                          </div>
                        ),
                      )}
                    </div>
                  </div>
                ) : null}

                {bulkResult.warnings?.length ? (
                  <div>
                    <div className="mb-1 font-semibold text-amber-800">
                      Warnings
                    </div>
                    <div className="space-y-1">
                      {bulkResult.warnings.map(
                        (warning: any, index: number) => (
                          <div
                            key={`${warning.code}-${index}`}
                            className="rounded border border-amber-500/30 bg-amber-500/5 p-2 text-amber-900"
                          >
                            {warning.sourceLine
                              ? `Line ${warning.sourceLine}: `
                              : ''}
                            {warning.message}
                          </div>
                        ),
                      )}
                    </div>
                  </div>
                ) : null}

                {bulkResult.items?.length ? (
                  <div className="overflow-auto">
                    <table className="min-w-full text-left text-xs">
                      <thead className="text-[var(--text-muted)]">
                        <tr>
                          <th className="px-2 py-1">Source</th>
                          <th className="px-2 py-1">Entity</th>
                          <th className="px-2 py-1">Mapping</th>
                        </tr>
                      </thead>
                      <tbody>
                        {bulkResult.items.slice(0, 50).map((item: any) => (
                          <tr
                            key={`${item.source}-${item.index}`}
                            className="border-t align-top"
                          >
                            <td className="px-2 py-1">
                              {item.source}
                              {item.sourceLine ? `:${item.sourceLine}` : ''}
                            </td>
                            <td className="px-2 py-1">
                              {item.entityType}:{item.entityId}
                            </td>
                            <td className="px-2 py-1">
                              <JsonPreview value={item.mapping} />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="text-sm text-[var(--text-secondary)]">
                Dry-run a CSV or JSON batch to see blockers, warnings, and the
                exact FTC-side mapping rows that would be applied.
              </div>
            )}
          </div>
        </CollapsibleStatusSection>

        <CollapsibleStatusSection
          title="FTC mapping change history"
          status={`${mappingHistory.length} changes`}
          statusVariant={
            mappingHistory.length ? STATUS_VARIANT.INFO : STATUS_VARIANT.SUCCESS
          }
          contentClassName="p-3 pt-0"
        >
          <div className="rounded border bg-[var(--surface-card)] p-3">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="text-sm font-semibold">
                  FTC mapping change history
                </div>
                <div className="text-xs text-[var(--text-secondary)]">
                  Rollback is blocked if the mapping changed after the selected
                  audit entry.
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <label className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
                  <input
                    type="checkbox"
                    checked={confirmedRollback}
                    onChange={(event) =>
                      setConfirmedRollback(event.target.checked)
                    }
                  />
                  Confirm rollback against physical site and PSS Configurator
                </label>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={loadHistory}
                  disabled={historyLoading}
                >
                  {historyLoading ? 'Loading...' : 'Refresh history'}
                </Button>
              </div>
            </div>
            {mappingHistory.length ? (
              <div className="overflow-auto">
                <table className="min-w-full text-left text-xs">
                  <thead className="text-[var(--text-muted)]">
                    <tr>
                      <th className="px-2 py-1">When</th>
                      <th className="px-2 py-1">Action</th>
                      <th className="px-2 py-1">Entity</th>
                      <th className="px-2 py-1">Old values</th>
                      <th className="px-2 py-1">New values</th>
                      <th className="px-2 py-1">User</th>
                      <th className="px-2 py-1">Rollback</th>
                    </tr>
                  </thead>
                  <tbody>
                    {mappingHistory.map((entry: any) => (
                      <tr key={entry.id} className="border-t align-top">
                        <td className="whitespace-nowrap px-2 py-1">
                          {fmtTs(entry.createdAt)}
                        </td>
                        <td className="px-2 py-1">
                          <Badge
                            variant={
                              entry.action === 'DOMS_MAPPING_ROLLED_BACK'
                                ? STATUS_VARIANT.NEUTRAL
                                : STATUS_VARIANT.INFO
                            }
                          >
                            {String(entry.action ?? '')
                              .replace('DOMS_MAPPING_', '')
                              .toLowerCase()}
                          </Badge>
                        </td>
                        <td className="px-2 py-1">
                          <div>{valueOrDash(entry.entityType)}</div>
                          <div className="text-[10px] text-[var(--text-muted)]">
                            {valueOrDash(entry.entityId)}
                          </div>
                        </td>
                        <td className="px-2 py-1">
                          <JsonPreview value={entry.oldValues} />
                        </td>
                        <td className="px-2 py-1">
                          <JsonPreview value={entry.newValues} />
                        </td>
                        <td className="px-2 py-1">
                          {valueOrDash(entry.userFullName ?? entry.username)}
                        </td>
                        <td className="px-2 py-1">
                          {entry.canRollback ? (
                            <Button
                              type="button"
                              size="sm"
                              variant="secondary"
                              disabled={
                                !csrfToken ||
                                !confirmedRollback ||
                                rollingBackId === entry.id
                              }
                              onClick={() => rollbackMapping(entry)}
                            >
                              {rollingBackId === entry.id
                                ? 'Rolling back...'
                                : 'Rollback'}
                            </Button>
                          ) : (
                            <span className="text-[var(--text-muted)]">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-sm text-[var(--text-secondary)]">
                No DOMS mapping changes have been audited yet.
              </div>
            )}
          </div>
        </CollapsibleStatusSection>

        <div className="space-y-2">
          <div className="text-sm font-semibold">Pump to DOMS FpId mapping</div>
          <div className="overflow-auto">
            <table className="min-w-full text-left text-xs">
              <thead className="text-[var(--text-muted)]">
                <tr>
                  <th className="px-2 py-1">Pump</th>
                  <th className="px-2 py-1">DOMS FpId</th>
                  <th className="px-2 py-1">Nozzles</th>
                  <th className="px-2 py-1">Observed</th>
                  <th className="px-2 py-1">Latest status</th>
                  <th className="px-2 py-1">Last seen</th>
                </tr>
              </thead>
              <tbody>
                {pumps.length ? (
                  pumps.slice(0, 24).map((pump: any) => (
                    <tr key={pump.id} className="border-t">
                      <td className="px-2 py-1 font-medium">
                        {pump.pump_number} - {pump.name}
                      </td>
                      <td className="px-2 py-1">
                        {valueOrDash(pump.domsFpId)}
                      </td>
                      <td className="px-2 py-1">{pump.nozzle_count}</td>
                      <td className="px-2 py-1">
                        <Badge
                          variant={
                            pump.observed
                              ? STATUS_VARIANT.SUCCESS
                              : STATUS_VARIANT.NEUTRAL
                          }
                        >
                          {pump.observed ? 'yes' : 'not seen'}
                        </Badge>
                      </td>
                      <td className="px-2 py-1">
                        {valueOrDash(pump.latestStatus)}
                      </td>
                      <td className="whitespace-nowrap px-2 py-1">
                        {fmtTs(pump.latestSeenAt)}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td
                      className="px-2 py-3 text-[var(--text-muted)]"
                      colSpan={6}
                    >
                      No configured pumps.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <div className="space-y-2">
            <div className="text-sm font-semibold">
              Nozzle grade/tank mappings
            </div>
            <div className="overflow-auto">
              <table className="min-w-full text-left text-xs">
                <thead className="text-[var(--text-muted)]">
                  <tr>
                    <th className="px-2 py-1">Pump / nozzle</th>
                    <th className="px-2 py-1">Grade option</th>
                    <th className="px-2 py-1">Grade</th>
                    <th className="px-2 py-1">DOMS tank</th>
                    <th className="px-2 py-1">Product</th>
                  </tr>
                </thead>
                <tbody>
                  {nozzles.length ? (
                    nozzles.slice(0, 30).map((nozzle: any) => (
                      <tr key={nozzle.id} className="border-t">
                        <td className="px-2 py-1">
                          {nozzle.pump_number} / {nozzle.nozzle_number}
                        </td>
                        <td className="px-2 py-1">
                          {valueOrDash(nozzle.domsGradeOptionId)}
                        </td>
                        <td className="px-2 py-1">
                          {valueOrDash(nozzle.domsGradeId)}
                        </td>
                        <td className="px-2 py-1">
                          {valueOrDash(nozzle.domsTankId)}
                        </td>
                        <td className="px-2 py-1">
                          {valueOrDash(
                            nozzle.product_name ?? nozzle.product_code,
                          )}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td
                        className="px-2 py-3 text-[var(--text-muted)]"
                        colSpan={5}
                      >
                        No configured nozzles.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="space-y-2">
            <div className="text-sm font-semibold">
              Tank to DOMS TankId mapping
            </div>
            <div className="overflow-auto">
              <table className="min-w-full text-left text-xs">
                <thead className="text-[var(--text-muted)]">
                  <tr>
                    <th className="px-2 py-1">Tank</th>
                    <th className="px-2 py-1">DOMS TankId</th>
                    <th className="px-2 py-1">Product</th>
                    <th className="px-2 py-1">Live volume</th>
                    <th className="px-2 py-1">Updated</th>
                  </tr>
                </thead>
                <tbody>
                  {tanks.length ? (
                    tanks.slice(0, 30).map((tank: any) => (
                      <tr key={tank.id} className="border-t">
                        <td className="px-2 py-1 font-medium">
                          {tank.code} - {tank.name}
                        </td>
                        <td className="px-2 py-1">
                          {valueOrDash(tank.domsTankId)}
                        </td>
                        <td className="px-2 py-1">
                          {valueOrDash(tank.product_name ?? tank.product_code)}
                        </td>
                        <td className="px-2 py-1">
                          {valueOrDash(tank.live_volume_litres)}
                        </td>
                        <td className="whitespace-nowrap px-2 py-1">
                          {fmtTs(tank.live_volume_updated_at)}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td
                        className="px-2 py-3 text-[var(--text-muted)]"
                        colSpan={5}
                      >
                        No configured tanks.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </CollapsibleStatusSection>
  )
}
