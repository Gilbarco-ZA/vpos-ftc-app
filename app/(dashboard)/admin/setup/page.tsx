'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { ChevronDown } from 'lucide-react'

import { api } from '@/src/shared/api/fetch'
import { STATUS_VARIANT } from '@/src/shared/status/ui'

import { PageHeader } from '@/components/layout/page-header'
import PssConfigurationVerification from '@/components/setup/PssConfigurationVerification'
import TankConfigClient from '@/components/tanks/TankConfigClient'
import { Alert } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'

import type { DbTank, Product, PumpSnapshot, SetupCurrent } from './types'
import ForecourtSettingsCard from './forecourt-settings-card'
import { productLabel, suggestProductId } from './helpers'
import PssXmlImportCard from './pss-xml-import-card'
import {
  Field,
  RequirementRow,
  SetupCard,
  SetupOverviewSection,
} from './setup-sections'
import { setupSteps, useSetupStepNavigation } from './use-setup-step-navigation'

type SetupCountryOption = {
  value: string
  label: string
  countryCode?: string
  countryName?: string
  currencyCode?: string | null
  timezone?: string | null
  defaultLanguageCode?: string | null
}

export default function SetupWizardPage() {
  const [loading, setLoading] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const searchParams = useSearchParams()

  useEffect(() => {
    const initialToast = searchParams?.get('toast')
    if (initialToast) queueMicrotask(() => setToast(initialToast))
  }, [searchParams])

  const [current, setCurrent] = useState<SetupCurrent | null>(null)
  const [products, setProducts] = useState<Product[]>([])
  const [pumpSnapshot, setPumpSnapshot] = useState<PumpSnapshot | null>(null)
  const [nowMs, setNowMs] = useState(() => Date.now())
  const [dbTanks, setDbTanks] = useState<DbTank[]>([])

  useEffect(() => {
    const intervalId = window.setInterval(() => setNowMs(Date.now()), 5_000)
    return () => window.clearInterval(intervalId)
  }, [])

  const [siteName, setSiteName] = useState('')
  const [taxNumber, setTaxNumber] = useState('')
  const [address, setAddress] = useState('')
  const [countryOptions, setCountryOptions] = useState<SetupCountryOption[]>([])
  const [country, setCountry] = useState('')
  const [currency, setCurrency] = useState('')
  const [timezone, setTimezone] = useState('')

  const [mapping, setMapping] = useState<
    Record<string, Record<string, string>>
  >({})

  const loadCountryOptions = useCallback(async () => {
    const r = await api<{ options: SetupCountryOption[] }>(
      '/api/config/setup-countries',
    )
    if (r.success && Array.isArray((r.data as any)?.options)) {
      const options = (r.data as any).options as SetupCountryOption[]
      setCountryOptions(options)
      if (!country && options[0]?.value) {
        setCountry(options[0].value)
        if (options[0].currencyCode) setCurrency(options[0].currencyCode)
        if (options[0].timezone) setTimezone(options[0].timezone)
      }
      return options
    }
    setToast(r.error || 'Failed to load country datasets')
    return []
  }, [country])

  const applyCountrySelection = (value: string) => {
    setCountry(value)
    const option = countryOptions.find((item) => item.value === value)
    if (option?.currencyCode) setCurrency(option.currencyCode)
    if (option?.timezone) setTimezone(option.timezone)
  }

  const refresh = useCallback(async () => {
    const r = await api<SetupCurrent>('/api/admin/setup/current')
    if (r.success && r.data) {
      setCurrent(r.data)
      const sp = r.data.siteProfile
      if (sp) {
        setSiteName(sp.siteName || '')
        setTaxNumber(sp.taxNumber || '')
        setAddress(sp.address || '')
        setCountry(sp.country || '')
        setCurrency(sp.currency || '')
        setTimezone(sp.timezone || '')
      }
      if (r.data.pumps?.liveState) setPumpSnapshot(r.data.pumps.liveState)

      if (
        r.data.pumps?.config?.pumps &&
        Array.isArray(r.data.pumps.config.pumps)
      ) {
        const m: Record<string, Record<string, string>> = {}
        for (const p of r.data.pumps.config.pumps) {
          m[p.pumpId] = m[p.pumpId] || {}
          for (const n of p.nozzles || []) {
            // Canonical: tankId, with legacy fallback to productId.
            if (n?.nozzleId && (n?.tankId || n?.productId))
              m[p.pumpId][n.nozzleId] = n.tankId || n.productId
          }
        }
        setMapping(m)
      }
    } else {
      setToast(r.error || 'Failed to load setup state')
    }
  }, [])

  const refreshProducts = useCallback(async () => {
    const r = await api<Product[]>('/api/products')
    if (r.success && r.data) setProducts(r.data)
  }, [])

  const refreshPumps = useCallback(async () => {
    const r = await api<{ config: any; liveState: PumpSnapshot }>(
      '/api/pumps/state',
    )
    if (r.success && r.data?.liveState) {
      setPumpSnapshot(r.data.liveState)
    }
  }, [])

  const refreshDbTanks = useCallback(async () => {
    const r = await api<{ tanks: DbTank[] }>('/api/settings/tanks')
    if (r.success && (r.data as any)?.tanks) setDbTanks((r.data as any).tanks)
  }, [])

  useEffect(() => {
    queueMicrotask(() => {
      void loadCountryOptions()
    })
    queueMicrotask(() => {
      refresh()
    })
    queueMicrotask(() => {
      refreshProducts()
    })
    queueMicrotask(() => {
      refreshPumps()
    })
    queueMicrotask(() => {
      refreshDbTanks()
    })
  }, [
    loadCountryOptions,
    refresh,
    refreshDbTanks,
    refreshProducts,
    refreshPumps,
  ])

  const canFinalize = useMemo(() => {
    const hasSite = Boolean(current?.siteProfile)
    const hasTanks =
      Array.isArray((current as any)?.tanks?.grades) &&
      ((current as any).tanks.grades?.length ?? 0) > 0 &&
      Array.isArray((current as any)?.tanks?.activeTanks) &&
      (current as any).tanks.activeTanks.some((v: any) => !!v)
    const hasProducts = (current?.products?.count ?? 0) > 0
    const hasPumpCfg = Boolean(current?.pumps?.config)
    const hasPrinter = Boolean(current?.printer?.configured)
    return hasSite && hasTanks && hasProducts && hasPumpCfg && hasPrinter
  }, [current])

  const saveSiteProfile = async () => {
    setLoading(true)
    setToast(null)
    const r = await api('/api/admin/setup/site-profile', {
      method: 'POST',
      body: JSON.stringify({
        siteName,
        taxNumber,
        address,
        country,
        currency,
        timezone,
      }),
    })
    setLoading(false)
    if (!r.success) return setToast(r.error || 'Failed to save site profile')
    setToast('Saved site profile')
    await refresh()
  }

  const markProducts = async () => {
    setLoading(true)
    setToast(null)
    const r = await api('/api/admin/setup/mark-step', {
      method: 'POST',
      body: JSON.stringify({ step: 'products' }),
    })
    setLoading(false)
    if (!r.success) return setToast(r.error || 'Failed to mark products step')
    setToast('Marked products step complete')
    await refresh()
  }

  const setNozzleTank = (pumpId: string, nozzleId: string, tankId: string) => {
    setMapping((prev) => ({
      ...prev,
      [pumpId]: {
        ...(prev[pumpId] || {}),
        [nozzleId]: tankId,
      },
    }))
  }

  const autoMapAll = () => {
    if (!pumpSnapshot?.pumps?.length || !products.length) return
    setMapping((prev) => {
      const next = { ...prev }
      for (const pump of pumpSnapshot.pumps || []) {
        const pid = String(pump.pumpId)
        next[pid] = { ...(next[pid] || {}) }
        for (const noz of pump.nozzles || []) {
          const nid = String(noz.nozzleId)
          if (next[pid][nid]) continue
          const suggestion = suggestProductId(noz.fuelType, products)
          if (!suggestion) continue

          // Prefer a tank whose productExternalId matches the suggested productId.
          const tank = dbTanks.find((t) => t.productExternalId === suggestion)
          if (tank?.id) next[pid][nid] = tank.id
        }
      }
      return next
    })
    setToast(
      'Auto-mapped where possible (review and save). If a nozzle is still empty, create tanks first (Settings > Tanks).',
    )
  }

  const savePumpsConfig = async () => {
    setLoading(true)
    setToast(null)

    const pumps = (pumpSnapshot?.pumps || []).map((p) => ({
      pumpId: String(p.pumpId),
      nozzles: (p.nozzles || []).map((n) => ({
        nozzleId: String(n.nozzleId),
        tankId: (mapping[String(p.pumpId)] || {})[String(n.nozzleId)] || '',
      })),
    }))

    const unmapped: string[] = []
    for (const p of pumps) {
      for (const n of p.nozzles) {
        if (!n.tankId) unmapped.push(`Pump ${p.pumpId} nozzle ${n.nozzleId}`)
      }
    }
    if (unmapped.length) {
      setLoading(false)
      return setToast(
        `Unmapped nozzles: ${unmapped.slice(0, 6).join(', ')}${unmapped.length > 6 ? '…' : ''}`,
      )
    }

    const r = await api('/api/admin/setup/pumps-config', {
      method: 'POST',
      body: JSON.stringify({ pumps }),
    })
    setLoading(false)
    if (!r.success) return setToast(r.error || 'Failed to save pumps config')
    setToast('Saved pumps configuration')
    await refresh()
  }

  const testTxnPrint = async () => {
    setLoading(true)
    setToast(null)
    const r = await api('/api/admin/setup/test-transaction-printout', {
      method: 'POST',
      body: '{}',
    })
    setLoading(false)
    if (!r.success) return setToast(r.error || 'Transaction print test failed')
    setToast('Transaction print test queued')
  }

  const testReportPrint = async () => {
    setLoading(true)
    setToast(null)
    const r = await api('/api/admin/setup/test-report-printout', {
      method: 'POST',
      body: '{}',
    })
    setLoading(false)
    if (!r.success) return setToast(r.error || 'Report print test failed')
    setToast('Report print test queued')
  }

  const testPrinterConnection = async () => {
    setLoading(true)
    setToast(null)
    const r = await api('/api/admin/setup/test-printer-connection', {
      method: 'POST',
      body: '{}',
    })
    setLoading(false)
    if (!r.success)
      return setToast(r.error || 'Printer connectivity test failed')
    const ip = (r.data as any)?.ip
    const port = (r.data as any)?.port
    setToast(`Printer connection OK (${ip}:${port})`)
    await refresh()
  }

  const finalize = async () => {
    setLoading(true)
    setToast(null)
    const r = await api('/api/admin/setup/finalize', {
      method: 'POST',
      body: '{}',
    })
    setLoading(false)
    if (!r.success) return setToast(r.error || 'Finalize failed')
    setToast('Setup finalized')
    await refresh()
  }

  const pumpDiag = useMemo(() => {
    const pumps = pumpSnapshot?.pumps || []
    const nozzleCount = pumps.reduce(
      (acc, p) => acc + (p.nozzles?.length || 0),
      0,
    )
    const ts = pumpSnapshot?.updatedAt || 0
    const ageMs = ts ? nowMs - ts : null
    return { pumps: pumps.length, nozzles: nozzleCount, updatedAt: ts, ageMs }
  }, [nowMs, pumpSnapshot])

  const pumpFreshness = useMemo(() => {
    if (!pumpDiag.updatedAt) return 'unknown'
    if (pumpDiag.ageMs == null) return 'unknown'
    if (pumpDiag.ageMs < 30_000) return 'fresh (<30s)'
    if (pumpDiag.ageMs < 60_000) return 'ok (<60s)'
    return `stale (${Math.round(pumpDiag.ageMs / 1000)}s)`
  }, [pumpDiag])

  const {
    stepReadiness,
    maxUnlockedStepIndex,
    activeStep,
    activeStepKey,
    canGoNextFromStep,
    shouldShowZeroStepsOpen,
    goToStep,
    handleNext,
    handleBack,
  } = useSetupStepNavigation({ current, pumpAgeMs: pumpDiag.ageMs })

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <PageHeader
          title="Setup Wizard"
          description="Fetch current config first, then commission the station: site profile -> products -> pumps mapping -> printer -> finalize."
        />
        {toast ? (
          <Alert variant={STATUS_VARIANT.SUCCESS} title="Update">
            {toast}
          </Alert>
        ) : null}
      </div>

      <PssConfigurationVerification compact />

      <SetupOverviewSection
        steps={setupSteps}
        activeStep={activeStep}
        maxUnlockedStepIndex={maxUnlockedStepIndex}
        onStepSelect={goToStep}
        current={current}
        pumpFreshness={pumpFreshness}
        pumpDiag={pumpDiag}
        loading={loading}
        onRefresh={refresh}
        onRefreshProducts={refreshProducts}
        onRefreshPumps={refreshPumps}
      />

      <details
        className="group rounded-card border border-border bg-surface-card p-4"
        open={shouldShowZeroStepsOpen}
      >
        <summary className="flex cursor-pointer list-none items-center justify-between text-sm font-semibold text-[var(--text-primary)]">
          <div>
            Imports & forecourt settings
            <span className="ml-2 text-xs font-normal text-[var(--text-muted)]">
              (Optional legacy XML import + JPL forecourt config)
            </span>
          </div>

          <ChevronDown
            size={18}
            className="transition-transform duration-200 group-open:rotate-180"
          />
        </summary>

        <div className="mt-4 space-y-4">
          <PssXmlImportCard
            onImported={async () => {
              await Promise.all([
                refresh(),
                refreshProducts(),
                refreshPumps(),
                refreshDbTanks(),
              ])
            }}
          />
          <ForecourtSettingsCard />
        </div>
      </details>

      {activeStepKey === 'site' && (
        <SetupCard title="1) Site profile">
          <div className="grid gap-3 md:grid-cols-2">
            <Field label="Site name">
              <Input
                value={siteName}
                onChange={(e) => setSiteName(e.target.value)}
              />
            </Field>
            <Field label="Tax number">
              <Input
                value={taxNumber}
                onChange={(e) => setTaxNumber(e.target.value)}
              />
            </Field>
            <Field label="Address">
              <Input
                value={address}
                onChange={(e) => setAddress(e.target.value)}
              />
            </Field>
            <Field label="Country">
              <Select
                value={country}
                onChange={(e) => applyCountrySelection(e.target.value)}
              >
                {countryOptions.length === 0 ? (
                  <option value="">No active country datasets</option>
                ) : null}
                {countryOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Currency">
              <Input
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
              />
            </Field>
            <Field label="Timezone">
              <Input
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
              />
            </Field>
          </div>
          <div className="mt-3">
            <Button
              variant="primary"
              onClick={saveSiteProfile}
              disabled={loading || !siteName.trim()}
            >
              Save site profile
            </Button>
          </div>
        </SetupCard>
      )}

      {activeStepKey === 'tanks' && (
        <SetupCard title="2) Tanks">
          <p className="text-sm text-[var(--text-secondary)]">
            Configure fuel grades and active tanks. This is used for
            availability validation and manager controls.
          </p>
          <div className="mt-3">
            <TankConfigClient mode="admin" />
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button asChild variant="secondary" size="sm">
              <Link href="/tanks">Open full tanks editor</Link>
            </Button>
            <Button variant="secondary" onClick={refresh} disabled={loading}>
              Refresh setup state
            </Button>
          </div>
        </SetupCard>
      )}

      {activeStepKey === 'products' && (
        <SetupCard title="3) Products">
          <p className="text-sm text-[var(--text-secondary)]">
            Create products and set their values. Then mark this step complete
            (optional, for progress tracking).
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button asChild variant="secondary" size="sm">
              <Link href="/admin/products">Open products</Link>
            </Button>
            <Button
              variant="secondary"
              onClick={refreshProducts}
              disabled={loading}
            >
              Refresh product list
            </Button>
            <Button
              variant="primary"
              onClick={markProducts}
              disabled={loading || !products.length}
            >
              Mark products step complete
            </Button>
          </div>
          <div className="mt-3 rounded-xl border bg-[var(--surface-muted)] p-3 text-sm">
            <b>Loaded products:</b> {products.length}
            {products.length ? (
              <ul className="mt-2 list-disc pl-5">
                {products.slice(0, 10).map((p) => (
                  <li key={p.productId}>{productLabel(p)}</li>
                ))}
              </ul>
            ) : (
              <div className="mt-2 text-[var(--text-secondary)]">
                No products loaded yet.
              </div>
            )}
          </div>
        </SetupCard>
      )}

      {activeStepKey === 'pumps' && (
        <SetupCard title="4) Pumps & nozzle -> tank mapping">
          <p className="text-sm text-[var(--text-secondary)]">
            We auto-detect pumps/nozzles from the live pump state feed. Assign a
            tank per nozzle and save.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              variant="secondary"
              onClick={refreshPumps}
              disabled={loading}
            >
              Refresh pump state
            </Button>
            <Button
              variant="secondary"
              onClick={refreshDbTanks}
              disabled={loading}
            >
              Refresh tanks
            </Button>
            <Button
              variant="secondary"
              onClick={autoMapAll}
              disabled={
                loading ||
                !products.length ||
                !dbTanks.length ||
                !pumpSnapshot?.pumps?.length
              }
            >
              Auto-map from fuel type
            </Button>
            <span className="self-center text-xs text-[var(--text-muted)]">
              Feed: {pumpFreshness}
            </span>
          </div>

          {!pumpSnapshot?.pumps?.length ? (
            <div className="mt-3 rounded-xl border bg-[var(--surface-muted)] p-3 text-sm">
              No pumps detected yet. Ensure PPX integration is configured and
              pump state messages are flowing.
            </div>
          ) : (
            <div className="mt-4 space-y-4">
              {(pumpSnapshot.pumps || []).map((pump) => (
                <div
                  key={String(pump.pumpId)}
                  className="rounded-2xl border p-4"
                >
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <div className="text-sm font-semibold">
                      Pump {String(pump.pumpId)}
                    </div>
                    <div className="text-xs text-[var(--text-muted)]">
                      Updated:{' '}
                      {pump.updatedAt
                        ? new Date(pump.updatedAt).toLocaleString()
                        : '—'}
                    </div>
                  </div>

                  <div className="grid gap-3 md:grid-cols-2">
                    {(pump.nozzles || []).map((nozzle) => {
                      const pumpId = String(pump.pumpId)
                      const nozzleId = String(nozzle.nozzleId)
                      const selected = (mapping[pumpId] || {})[nozzleId] || ''
                      return (
                        <div
                          key={nozzleId}
                          className="rounded-xl border bg-[var(--surface-muted)] p-3"
                        >
                          <div className="mb-2 flex items-center justify-between gap-2">
                            <div className="text-sm font-semibold">
                              Nozzle {nozzleId}
                            </div>
                            <div className="text-xs text-[var(--text-secondary)]">
                              {nozzle.state || '—'} •{' '}
                              {nozzle.updatedAt
                                ? new Date(
                                    nozzle.updatedAt,
                                  ).toLocaleTimeString()
                                : '—'}
                            </div>
                          </div>
                          <div className="mb-2 text-xs text-[var(--text-secondary)]">
                            <b>Fuel type:</b> {nozzle.fuelType || '—'}
                          </div>

                          <Field label="Tank">
                            <Select
                              value={selected}
                              onChange={(e) =>
                                setNozzleTank(pumpId, nozzleId, e.target.value)
                              }
                            >
                              <option value="">Select tank...</option>
                              {dbTanks.map((t) => (
                                <option key={t.id} value={t.id}>
                                  {t.code} — {t.name} ({t.productCode})
                                </option>
                              ))}
                            </Select>
                          </Field>
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))}

              <div className="flex gap-2">
                <Button
                  variant="primary"
                  onClick={savePumpsConfig}
                  disabled={loading || !products.length || !dbTanks.length}
                >
                  Save pumps mapping
                </Button>
                {!products.length ? (
                  <span className="self-center text-xs text-[var(--text-muted)]">
                    Create products first.
                  </span>
                ) : !dbTanks.length ? (
                  <span className="self-center text-xs text-[var(--text-muted)]">
                    Create tanks first (Settings &gt; Tanks).
                  </span>
                ) : null}
              </div>
            </div>
          )}
        </SetupCard>
      )}

      {activeStepKey === 'printer' && (
        <SetupCard title="5) Printer">
          <p className="text-sm text-[var(--text-secondary)]">
            Configure the printer in Devices / integrations. Run connection test
            (marks printer step complete) and print tests.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button asChild variant="secondary" size="sm">
              <Link href="/admin/config/printers">Configure printer</Link>
            </Button>
            <Button
              variant="secondary"
              onClick={testPrinterConnection}
              disabled={loading}
            >
              Test connection (TCP)
            </Button>
            <Button
              variant="secondary"
              onClick={testTxnPrint}
              disabled={loading}
            >
              Test transaction print
            </Button>
            <Button
              variant="secondary"
              onClick={testReportPrint}
              disabled={loading}
            >
              Test report print
            </Button>
          </div>
        </SetupCard>
      )}

      {activeStepKey === 'finalized' && (
        <SetupCard title="6) Finalize">
          {stepReadiness.finalized && (
            <Badge variant={STATUS_VARIANT.SUCCESS} className="mb-3">
              ✓ Setup completed
            </Badge>
          )}
          <p className="text-sm text-[var(--text-secondary)]">
            Before you finalize, check that everything below is green.
            Finalizing locks in this station setup for normal operation.
          </p>

          <div className="mt-4 space-y-3 rounded-2xl border bg-[var(--surface-muted)] p-3">
            <RequirementRow
              ok={stepReadiness.site}
              label="Site profile saved"
              detail="Name, address, country, currency, and timezone have been captured."
            />
            <RequirementRow
              ok={stepReadiness.tanks}
              label="Tanks configured"
              detail="Grades and active tanks are set up."
            />
            <RequirementRow
              ok={stepReadiness.products}
              label="Products created"
              detail="At least one sellable product exists."
            />
            <RequirementRow
              ok={stepReadiness.pumps}
              label="Pump mapping saved"
              detail="Each active nozzle is mapped to a tank."
            />
            <RequirementRow
              ok={stepReadiness.printer}
              label="Printer configured"
              detail="Printer connection has been tested successfully."
            />
            <RequirementRow
              ok={stepReadiness.pumpFeedFresh}
              label="Pump status feed is fresh"
              detail={`Current feed: ${pumpFreshness}.`}
            />
          </div>

          <div className="mt-4 flex items-center justify-between gap-3">
            <div className="text-xs text-[var(--text-muted)]">
              {canFinalize
                ? 'All required items look good. You can finalize the setup.'
                : 'Fix any items still grey above before finalizing.'}
            </div>
            <Button
              variant="primary"
              onClick={finalize}
              disabled={loading || !canFinalize || stepReadiness.finalized}
            >
              {stepReadiness.finalized ? 'Already finalized' : 'Finalize setup'}
            </Button>
          </div>
        </SetupCard>
      )}

      <div className="mt-4 flex items-center justify-between">
        <Button
          variant="secondary"
          onClick={handleBack}
          disabled={activeStep === 0 || loading}
        >
          Back
        </Button>
        {activeStepKey !== 'finalized' && (
          <Button
            variant="primary"
            onClick={handleNext}
            disabled={!canGoNextFromStep || loading}
          >
            Next
          </Button>
        )}
      </div>
    </div>
  )
}
