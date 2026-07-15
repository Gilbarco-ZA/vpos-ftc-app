'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { CheckCircle2, RefreshCw, TriangleAlert } from 'lucide-react'

import { STATUS_VARIANT } from '@/src/shared/status/ui'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'

type PssXmlStatus = {
  lastImportAt?: string | null
  lastImportError?: string | null
  parsedSummary?: {
    grades: number
    tanks: number
    fuellingPoints: number
  } | null
}

type SetupCounts = {
  products: number
  tanks: number
  pumps: number
  nozzles: number
}

type Reconciliation = {
  severity?: 'ok' | 'info' | 'warning' | 'error'
  generatedAt?: string
  summary?: {
    configuredPumps?: number
    configuredNozzles?: number
    configuredTanks?: number
    unresolvedBlockingIssueCount?: number
  }
  issues?: Array<{
    severity: 'info' | 'warning' | 'error'
    code: string
    message: string
    entityId?: string | number | null
  }>
}

const variantForSeverity = (severity?: string) => {
  if (severity === 'error') return STATUS_VARIANT.ERROR
  if (severity === 'warning') return STATUS_VARIANT.WARN
  if (severity === 'ok') return STATUS_VARIANT.SUCCESS
  return STATUS_VARIANT.INFO
}

const formatDate = (value?: string | null) => {
  if (!value) return 'Never'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString()
}

function Metric({
  label,
  pss,
  ftc,
}: {
  label: string
  pss: number
  ftc: number
}) {
  const matches = pss === ftc
  return (
    <div className="rounded-card border border-border bg-surface-card p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-[var(--text-secondary)]">
          {label}
        </span>
        <Badge variant={matches ? STATUS_VARIANT.SUCCESS : STATUS_VARIANT.WARN}>
          {matches ? 'Match' : 'Review'}
        </Badge>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
        <div>
          <div className="text-xs text-[var(--text-muted)]">
            PSS Configurator
          </div>
          <div className="font-semibold">{pss}</div>
        </div>
        <div>
          <div className="text-xs text-[var(--text-muted)]">FTC setup</div>
          <div className="font-semibold">{ftc}</div>
        </div>
      </div>
    </div>
  )
}

export default function PssConfigurationVerification({
  compact = false,
}: {
  compact?: boolean
}) {
  const [xml, setXml] = useState<PssXmlStatus | null>(null)
  const [reconciliation, setReconciliation] = useState<Reconciliation | null>(
    null,
  )
  const [counts, setCounts] = useState<SetupCounts | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [xmlResponse, reconciliationResponse, countsResponse] =
        await Promise.all([
          fetch('/api/admin/integrations/pss-xml', { cache: 'no-store' }),
          fetch('/api/admin/forecourt/reconciliation', { cache: 'no-store' }),
          fetch('/api/setup/forecourt', { cache: 'no-store' }),
        ])
      const [xmlBody, reconciliationBody, countsBody] = await Promise.all([
        xmlResponse.json().catch(() => ({})),
        reconciliationResponse.json().catch(() => ({})),
        countsResponse.json().catch(() => ({})),
      ])
      if (!xmlResponse.ok)
        throw new Error(
          xmlBody?.error || 'Failed to load PSS Configurator data',
        )
      if (!reconciliationResponse.ok)
        throw new Error(
          reconciliationBody?.error || 'Failed to verify FTC mappings',
        )
      if (!countsResponse.ok)
        throw new Error(countsBody?.error || 'Failed to load FTC setup counts')
      setXml(xmlBody?.data ?? null)
      setReconciliation(reconciliationBody?.data ?? null)
      setCounts(countsBody?.data ?? null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Verification failed')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
    const imported = () => void load()
    window.addEventListener('pss-xml-imported', imported)
    return () => window.removeEventListener('pss-xml-imported', imported)
  }, [load])

  const topIssues = useMemo(
    () =>
      (reconciliation?.issues ?? [])
        .filter((issue) => issue.severity !== 'info')
        .slice(0, compact ? 3 : 6),
    [compact, reconciliation],
  )

  const pss = xml?.parsedSummary
  const ftc = reconciliation?.summary
  const countsMatch = Boolean(
    pss &&
    counts &&
    pss.grades === counts.products &&
    pss.tanks === counts.tanks &&
    pss.fuellingPoints === counts.pumps,
  )
  const blocking = ftc?.unresolvedBlockingIssueCount ?? 0
  const verified = Boolean(
    pss &&
    countsMatch &&
    blocking === 0 &&
    reconciliation?.severity !== 'error',
  )

  return (
    <Card>
      <CardContent className="space-y-4 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-base font-semibold">
              {verified ? (
                <CheckCircle2 className="h-5 w-5" aria-hidden />
              ) : (
                <TriangleAlert className="h-5 w-5" aria-hidden />
              )}
              PSS Configurator verification
            </div>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">
              Compare the imported PSS configuration with FTC pump, nozzle, tank
              and product setup before commissioning.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge
              variant={
                verified
                  ? STATUS_VARIANT.SUCCESS
                  : variantForSeverity(reconciliation?.severity)
              }
            >
              {verified
                ? 'Verified'
                : String(
                    reconciliation?.severity ?? 'Not verified',
                  ).toUpperCase()}
            </Badge>
            <Button
              type="button"
              variant="secondary"
              onClick={load}
              disabled={loading}
            >
              <RefreshCw className="mr-2 h-4 w-4" aria-hidden />
              {loading ? 'Checking…' : 'Verify again'}
            </Button>
          </div>
        </div>

        {loading ? (
          <div className="grid gap-3 md:grid-cols-3">
            <Skeleton className="h-24" />
            <Skeleton className="h-24" />
            <Skeleton className="h-24" />
          </div>
        ) : error ? (
          <div className="rounded-card border border-red-500/30 bg-red-500/5 p-3 text-sm text-red-700">
            {error}
          </div>
        ) : !pss ? (
          <div className="rounded-card border border-amber-500/30 bg-amber-500/5 p-3 text-sm">
            No PSS Configurator baseline has been imported. Import{' '}
            <code>config.xml</code> before verifying setup.
          </div>
        ) : (
          <>
            <div className="grid gap-3 md:grid-cols-3">
              <Metric
                label="Fuel grades / products"
                pss={pss.grades}
                ftc={counts?.products ?? 0}
              />
              <Metric label="Tanks" pss={pss.tanks} ftc={counts?.tanks ?? 0} />
              <Metric
                label="Fuelling points / pumps"
                pss={pss.fuellingPoints}
                ftc={counts?.pumps ?? 0}
              />
            </div>

            <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-[var(--text-muted)]">
              <span>Last PSS import: {formatDate(xml?.lastImportAt)}</span>
              <span>
                Last verification: {formatDate(reconciliation?.generatedAt)}
              </span>
              <span>
                Nozzles configured:{' '}
                {counts?.nozzles ?? ftc?.configuredNozzles ?? 0}
              </span>
              <span>Blocking issues: {blocking}</span>
            </div>

            {xml?.lastImportError ? (
              <div className="rounded-card border border-red-500/30 bg-red-500/5 p-3 text-sm text-red-700">
                Latest PSS import error: {xml.lastImportError}
              </div>
            ) : null}

            {topIssues.length ? (
              <div className="space-y-2">
                <div className="text-sm font-semibold">
                  Items requiring review
                </div>
                {topIssues.map((issue) => (
                  <div
                    key={`${issue.code}-${String(issue.entityId ?? '')}`}
                    className="flex items-start gap-2 rounded-card border border-border p-3 text-sm"
                  >
                    <Badge variant={variantForSeverity(issue.severity)}>
                      {issue.severity}
                    </Badge>
                    <div>
                      <div className="font-medium">{issue.message}</div>
                      <div className="mt-1 text-xs text-[var(--text-muted)]">
                        {issue.code}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-card border border-green-500/30 bg-green-500/5 p-3 text-sm text-green-700">
                No pump, nozzle or tank mapping conflicts were detected in the
                latest verification snapshot.
              </div>
            )}
          </>
        )}

        <div className="flex flex-wrap gap-2 border-t border-border pt-3">
          <Button asChild variant="secondary">
            <Link href="/admin/setup">Import or review config.xml</Link>
          </Button>
          <Button asChild variant="secondary">
            <Link href="/settings/pumps">Review pumps</Link>
          </Button>
          <Button asChild variant="secondary">
            <Link href="/settings/tanks">Review tanks</Link>
          </Button>
          <Button asChild variant="secondary">
            <Link href="/admin/forecourt">Open full reconciliation</Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
