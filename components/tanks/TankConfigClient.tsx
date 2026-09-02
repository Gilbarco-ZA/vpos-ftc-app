'use client'

import type { TankConfig } from '@/src/shared/setup/tanksConfig'
import type { ActionStatus } from '@/src/shared/status/ui'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Loader2 } from 'lucide-react'

import { toNumberStrict as toNumberOrNull } from '@/src/shared/numbers'
import {
  defaultTankConfig,
  normalizeTankConfig,
  sanitizeTankConfigForSave,
} from '@/src/shared/setup/tanksConfig'
import { ACTION_STATUS, STATUS_VARIANT } from '@/src/shared/status/ui'

import CsrfBootstrap from '@/components/security/CsrfBootstrap'
import {
  DeliveryDataSummary,
  TankGaugeDataSummary,
} from '@/components/tanks/LiveTankDataPanel'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { LoadingOverlay } from '@/components/ui/loading-overlay'
import { Select } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'

type Mode = 'admin' | 'manager'

type StatusMessage = {
  type: ActionStatus
  message: string
}

const TankConfigClient = ({ mode }: { mode: Mode }) => {
  const [csrfToken, setCsrfToken] = useState('')
  const [config, setConfig] = useState<TankConfig>(defaultTankConfig)
  const [isLoading, setIsLoading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [status, setStatus] = useState<StatusMessage | null>(null)
  const [deliveryData, setDeliveryData] = useState<any>(null)
  const [tgData, setTgData] = useState<any>(null)
  const [liveDataLoading, setLiveDataLoading] = useState<
    'delivery' | 'tg' | null
  >(null)

  const isAdmin = mode === 'admin'
  const canEdit = mode === 'admin'

  const loadConfig = useCallback(async () => {
    setIsLoading(true)
    setStatus(null)
    try {
      const res = await fetch('/api/tanks', { cache: 'no-store' })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        const message = body?.error?.message || 'Failed to load tank settings'
        setStatus({ type: ACTION_STATUS.ERROR, message })
        return
      }
      const next = normalizeTankConfig(body?.data ?? defaultTankConfig)
      setConfig(next)
    } catch (err: any) {
      const message = err?.message || 'Failed to load tank settings'
      setStatus({ type: ACTION_STATUS.ERROR, message })
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    queueMicrotask(() => {
      loadConfig()
    })
  }, [loadConfig])

  useEffect(() => {
    const handler = () => {
      loadConfig()
    }
    window.addEventListener('pss-xml-imported', handler)
    return () => {
      window.removeEventListener('pss-xml-imported', handler)
    }
  }, [loadConfig])

  const updateConfig = (next: TankConfig) => {
    setConfig(normalizeTankConfig(next))
  }

  const addGrade = () => {
    updateConfig({
      ...config,
      grades: [...config.grades, ''],
      gradeLimits: [...(config.gradeLimits ?? []), null],
    })
  }

  const updateGrade = (index: number, value: string) => {
    const grades = [...config.grades]
    grades[index] = value
    updateConfig({ ...config, grades })
  }

  const updateGradeLimit = (index: number, value: string) => {
    const gradeLimits = [...(config.gradeLimits ?? [])]
    gradeLimits[index] = toNumberOrNull(value)
    updateConfig({ ...config, gradeLimits })
  }

  const removeGrade = (index: number) => {
    const removed = config.grades[index]
    const grades = config.grades.filter((_, i) => i !== index)
    const tanks = config.tanks.map((t) => (t === removed ? '' : t))
    const gradeLimits = (config.gradeLimits ?? []).filter((_, i) => i !== index)
    updateConfig({ ...config, grades, tanks, gradeLimits })
  }

  const addTank = () => {
    updateConfig({
      ...config,
      tanks: [...config.tanks, ''],
      activeTanks: [...config.activeTanks, false],
      tankLevels: [...(config.tankLevels ?? []), null],
    })
  }

  const removeTank = (index: number) => {
    const tanks = config.tanks.filter((_, i) => i !== index)
    const activeTanks = config.activeTanks.filter((_, i) => i !== index)
    const tankLevels = (config.tankLevels ?? []).filter((_, i) => i !== index)
    updateConfig({ ...config, tanks, activeTanks, tankLevels })
  }

  const updateTankGrade = (index: number, value: string) => {
    const tanks = [...config.tanks]
    tanks[index] = value
    updateConfig({ ...config, tanks })
  }

  const updateTankLevel = (index: number, value: string) => {
    const tankLevels = [...(config.tankLevels ?? [])]
    tankLevels[index] = toNumberOrNull(value)
    updateConfig({ ...config, tankLevels })
  }

  const updateTankActive = (index: number, active: boolean) => {
    const next = normalizeTankConfig({
      ...config,
      activeTanks: [...config.activeTanks],
    })
    next.activeTanks[index] = active
    if (active) {
      const grade = String(next.tanks[index] ?? '').trim()
      if (grade) {
        next.tanks.forEach((g, i) => {
          if (i !== index && String(g ?? '').trim() === grade) {
            next.activeTanks[i] = false
          }
        })
      }
    }
    updateConfig(next)
  }

  const saveConfig = async () => {
    setIsSaving(true)
    setStatus(null)
    try {
      const payload = isAdmin
        ? {
            csrf_token: csrfToken,
            config: sanitizeTankConfigForSave(config),
          }
        : { csrf_token: csrfToken, activeTanks: config.activeTanks }
      const res = await fetch('/api/tanks', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-csrf-token': csrfToken,
        },
        body: JSON.stringify(payload),
      })

      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        const message = body?.error?.message || 'Failed to save tank settings'
        setStatus({ type: ACTION_STATUS.ERROR, message })
        return
      }
      setConfig(normalizeTankConfig(body?.data ?? config))
      setStatus({
        type: ACTION_STATUS.SUCCESS,
        message: 'Tank settings saved.',
      })
    } catch (err: any) {
      const message = err?.message || 'Failed to save tank settings'
      setStatus({ type: ACTION_STATUS.ERROR, message })
    } finally {
      setIsSaving(false)
    }
  }

  const fetchLiveData = async (type: 'delivery' | 'tg') => {
    setStatus(null)
    setLiveDataLoading(type)
    try {
      if (type === 'tg') {
        const res = await fetch('/api/settings/tanks/sync-volumes', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-csrf-token': csrfToken,
          },
          body: JSON.stringify({
            csrf_token: csrfToken,
            publishTanzaniaInventory: true,
          }),
        })
        const body = await res.json().catch(() => ({}))
        if (!res.ok) {
          const message = body?.error?.message || 'Failed to fetch tank data'
          setStatus({ type: ACTION_STATUS.ERROR, message })
          return
        }

        const data = body?.data ?? {}
        if (data.config) {
          setConfig(normalizeTankConfig(data.config))
        }
        setTgData({ success: true, data: data.liveData ?? {} })

        const synced = Number(data?.synced?.count ?? 0)
        const levels = Number(data?.synced?.tankLevelUpdates ?? 0)
        const published = Number(data?.publication?.tankCount ?? 0)
        setStatus({
          type: ACTION_STATUS.SUCCESS,
          message:
            data?.publication?.ok === true
              ? `Refreshed ${synced} tank gauge(s), updated ${levels} tank level(s), and sent ${published} tank inventory record(s) to vpos-proxy.`
              : `Refreshed ${synced} tank gauge(s) and updated ${levels} tank level(s).`,
        })
        return
      }

      const res = await fetch('/api/pos/doms/getAllTankDeliveryData', {
        cache: 'no-store',
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        const message = body?.error?.message || 'Failed to fetch tank data'
        setStatus({ type: ACTION_STATUS.ERROR, message })
        return
      }
      setDeliveryData(body)
    } catch (err: any) {
      const message = err?.message || 'Failed to fetch tank data'
      setStatus({ type: ACTION_STATUS.ERROR, message })
    } finally {
      setLiveDataLoading(null)
    }
  }

  const tankRows = useMemo(
    () =>
      config.tanks.map((grade, index) => ({
        index,
        grade,
        active: !!config.activeTanks[index],
        level: config.tankLevels?.[index] ?? null,
      })),
    [config],
  )

  const totalsByGrade = useMemo(() => {
    const totals: Record<string, number> = {}
    config.tanks.forEach((grade, index) => {
      const key = String(grade ?? '').trim()
      if (!key) return
      const level = config.tankLevels?.[index]
      const volume =
        level === null || level === undefined || Number.isNaN(Number(level))
          ? 0
          : Number(level)
      totals[key] = (totals[key] ?? 0) + volume
    })
    return totals
  }, [config])

  const gradeSummaries = useMemo(
    () =>
      config.grades.map((grade, index) => {
        const key = String(grade ?? '').trim()
        const limit = config.gradeLimits?.[index] ?? null
        const total = key ? (totalsByGrade[key] ?? 0) : 0
        const overLimit =
          limit === null || limit === undefined
            ? false
            : Number.isFinite(Number(limit))
              ? total > Number(limit)
              : false
        return { grade: key, limit, total, overLimit }
      }),
    [config, totalsByGrade],
  )

  const hasLimitErrors = useMemo(
    () => gradeSummaries.some((summary) => summary.overLimit),
    [gradeSummaries],
  )

  const hasLoadedConfig = config.grades.length > 0 || config.tanks.length > 0
  const showInitialLoading = isLoading && !hasLoadedConfig

  return (
    <div className="space-y-6">
      <CsrfBootstrap onToken={setCsrfToken} />

      {status && (
        <Alert
          variant={
            status.type === ACTION_STATUS.ERROR
              ? STATUS_VARIANT.ERROR
              : STATUS_VARIANT.SUCCESS
          }
        >
          {status.message}
        </Alert>
      )}

      <div className="relative space-y-4 rounded border bg-[var(--surface-card)] p-4">
        {isLoading && hasLoadedConfig ? (
          <LoadingOverlay label="Loading tank settings…" />
        ) : null}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Tank Configuration</h2>
            <p className="text-sm text-[var(--text-secondary)]">
              Assign grades to tanks and mark the active tank per grade.
            </p>
          </div>
          <Button
            variant="primary"
            onClick={saveConfig}
            disabled={
              isLoading ||
              isSaving ||
              hasLimitErrors ||
              (!canEdit && !config.tanks.length)
            }
          >
            {isSaving ? 'Saving...' : 'Save Changes'}
          </Button>
        </div>

        {hasLimitErrors && (
          <Alert variant={STATUS_VARIANT.ERROR}>
            Virtual tank totals exceed the configured cloud availability. Fix
            the volumes before saving.
          </Alert>
        )}

        {showInitialLoading ? (
          <div className="space-y-6">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Skeleton className="h-5 w-32" />
                <Skeleton className="h-9 w-24" />
              </div>
              {Array.from({ length: 3 }).map((_, index) => (
                <div
                  key={index}
                  className="grid grid-cols-1 gap-2 md:grid-cols-[1fr_200px_96px]"
                >
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                </div>
              ))}
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Skeleton className="h-5 w-28" />
                <Skeleton className="h-9 w-24" />
              </div>
              {Array.from({ length: 4 }).map((_, index) => (
                <div
                  key={index}
                  className="grid grid-cols-1 gap-2 md:grid-cols-[1fr_1fr_120px]"
                >
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            {canEdit && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold">Available Grades</h3>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={addGrade}
                  >
                    Add Grade
                  </Button>
                </div>

                {config.grades.length === 0 && (
                  <div className="text-sm text-[var(--text-muted)]">
                    No grades added yet. Add a grade to assign to tanks.
                  </div>
                )}

                <div className="space-y-2">
                  {config.grades.map((grade, index) => (
                    <div
                      key={`grade-${index}`}
                      className="flex flex-wrap gap-2"
                    >
                      <Input
                        className="flex-1"
                        value={grade}
                        placeholder={`Grade ${index + 1}`}
                        onChange={(event) =>
                          updateGrade(index, event.target.value)
                        }
                      />
                      <Input
                        className="w-48"
                        value={
                          config.gradeLimits?.[index] === null ||
                          config.gradeLimits?.[index] === undefined
                            ? ''
                            : String(config.gradeLimits?.[index])
                        }
                        placeholder="Cloud available (L)"
                        onChange={(event) =>
                          updateGradeLimit(index, event.target.value)
                        }
                      />
                      <Button
                        type="button"
                        variant="destructive"
                        onClick={() => removeGrade(index)}
                      >
                        Remove
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold">Tanks</h3>
                {canEdit && (
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={addTank}
                  >
                    Add Tank
                  </Button>
                )}
              </div>

              {tankRows.length === 0 && (
                <div className="text-sm text-[var(--text-muted)]">
                  No tanks configured yet.
                </div>
              )}

              <div className="space-y-2">
                {tankRows.map((tank) => (
                  <div
                    key={`tank-${tank.index}`}
                    className="flex flex-wrap items-center gap-3 rounded border p-3"
                  >
                    <div className="text-sm font-semibold">
                      Tank {tank.index + 1}
                    </div>

                    {canEdit ? (
                      <Select
                        className="min-w-[180px]"
                        value={tank.grade}
                        onChange={(event) =>
                          updateTankGrade(tank.index, event.target.value)
                        }
                      >
                        <option value="">Select grade</option>
                        {config.grades.map((grade) => (
                          <option key={grade} value={grade}>
                            {grade}
                          </option>
                        ))}
                      </Select>
                    ) : (
                      <div className="text-sm text-[var(--text-secondary)]">
                        Grade: {tank.grade || '-'}
                      </div>
                    )}

                    <Input
                      className="w-32"
                      value={
                        tank.level === null || tank.level === undefined
                          ? ''
                          : String(tank.level)
                      }
                      placeholder="Level (L)"
                      onChange={(event) =>
                        updateTankLevel(tank.index, event.target.value)
                      }
                      disabled={!canEdit}
                    />

                    <label className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={tank.active}
                        onChange={(event) =>
                          updateTankActive(tank.index, event.target.checked)
                        }
                      />
                      Active
                    </label>

                    {canEdit && (
                      <Button
                        type="button"
                        variant="destructive"
                        size="sm"
                        className="ml-auto"
                        onClick={() => removeTank(tank.index)}
                      >
                        Remove
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-3">
              <h3 className="font-semibold">Virtual Tanks (by Grade)</h3>
              {gradeSummaries.length === 0 ? (
                <div className="text-sm text-[var(--text-muted)]">
                  Add grades and tank levels to see virtual tank totals.
                </div>
              ) : (
                <div className="space-y-2">
                  {gradeSummaries.map((summary, index) => (
                    <div
                      key={`summary-${index}`}
                      className={`flex flex-wrap items-center justify-between gap-3 rounded border px-3 py-2 text-sm ${
                        summary.overLimit
                          ? 'border-[var(--status-error-border)] bg-[var(--status-error-bg)] text-[var(--status-error-text)]'
                          : 'border-border bg-surface-muted text-[var(--text-secondary)]'
                      }`}
                    >
                      <div className="font-semibold">
                        {summary.grade || `Grade ${index + 1}`}
                      </div>
                      <div>Total: {summary.total.toFixed(3)} L</div>
                      <div>
                        Cloud available:{' '}
                        {summary.limit === null || summary.limit === undefined
                          ? 'Not set'
                          : `${Number(summary.limit).toFixed(3)} L`}
                      </div>
                      {summary.overLimit && (
                        <div className="font-semibold">
                          Exceeds cloud availability
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {isAdmin && (
        <div className="space-y-4 rounded border bg-[var(--surface-card)] p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">Live Tank Data</h2>
              <p className="text-sm text-[var(--text-secondary)]">
                Pull the latest tank delivery and tank gauge readings from POS.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => fetchLiveData('delivery')}
                disabled={liveDataLoading !== null}
                className="gap-2"
              >
                {liveDataLoading === 'delivery' ? (
                  <Loader2
                    className="h-4 w-4 animate-spin"
                    aria-hidden="true"
                  />
                ) : null}
                {liveDataLoading === 'delivery'
                  ? 'Refreshing…'
                  : 'Refresh Delivery Data'}
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => fetchLiveData('tg')}
                disabled={liveDataLoading !== null}
                className="gap-2"
              >
                {liveDataLoading === 'tg' ? (
                  <Loader2
                    className="h-4 w-4 animate-spin"
                    aria-hidden="true"
                  />
                ) : null}
                {liveDataLoading === 'tg'
                  ? 'Refreshing…'
                  : 'Refresh Tank Gauge Data'}
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 2xl:grid-cols-2">
            <div className="rounded border bg-[var(--surface-muted)] p-3">
              <DeliveryDataSummary data={deliveryData} />
            </div>
            <div className="rounded border bg-[var(--surface-muted)] p-3">
              <TankGaugeDataSummary
                data={tgData}
                configuredGrades={config.tanks}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default TankConfigClient
