'use client'

import type { ActionStatus } from '@/src/shared/status/ui'
import type { UserRole } from '@/src/shared/types'
import { useCallback, useEffect, useMemo, useState } from 'react'

import { ACTION_STATUS, STATUS_VARIANT } from '@/src/shared/status/ui'

import { PageHeader } from '@/components/layout/page-header'
import CsrfBootstrap from '@/components/security/CsrfBootstrap'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { EmptyState } from '@/components/ui/empty-state'
import { ErrorDetails } from '@/components/ui/error-details'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

type TankConfig = {
  grades: string[]
  gradeLimits?: Array<number | null>
  tanks: string[]
  activeTanks: boolean[]
  tankLevels?: Array<number | null>
}

type TankGradesClientProps = {
  role: UserRole
}

type StatusMessage = {
  type: ActionStatus
  message: string
}

const emptyConfig: TankConfig = {
  grades: [],
  gradeLimits: [],
  tanks: [],
  activeTanks: [],
  tankLevels: [],
}

const normalize = (value: string) => String(value ?? '').trim()

export default function TankGradesClient({ role }: TankGradesClientProps) {
  const [csrfToken, setCsrfToken] = useState('')
  const [config, setConfig] = useState<TankConfig>(emptyConfig)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [loadError, setLoadError] = useState<unknown>(null)
  const [status, setStatus] = useState<StatusMessage | null>(null)

  const isManager = role === 'manager'

  const loadConfig = useCallback(async () => {
    setIsLoading(true)
    setLoadError(null)
    try {
      const res = await fetch('/api/tanks', { cache: 'no-store' })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw body
      setConfig(body?.data ?? emptyConfig)
    } catch (err) {
      setLoadError(err)
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    loadConfig()
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

  const gradeOptions = useMemo(() => {
    return (config.grades ?? []).map((grade) => ({
      value: grade,
      label: grade,
    }))
  }, [config.grades])

  const addGrade = () => {
    setConfig((prev) => ({
      ...prev,
      grades: [...prev.grades, ''],
      gradeLimits: [...(prev.gradeLimits ?? []), null],
    }))
  }

  const removeGrade = (index: number) => {
    setConfig((prev) => {
      const nextGrades = prev.grades.filter((_, i) => i !== index)
      const nextLimits = (prev.gradeLimits ?? []).filter((_, i) => i !== index)
      return { ...prev, grades: nextGrades, gradeLimits: nextLimits }
    })
  }

  const updateGrade = (index: number, value: string) => {
    setConfig((prev) => {
      const next = [...prev.grades]
      next[index] = value
      return { ...prev, grades: next }
    })
  }

  const updateGradeLimit = (index: number, value: string) => {
    setConfig((prev) => {
      const next = [...(prev.gradeLimits ?? [])]
      const parsed = value.trim() ? Number(value) : null
      next[index] = Number.isFinite(parsed as number)
        ? (parsed as number)
        : null
      return { ...prev, gradeLimits: next }
    })
  }

  const addTank = () => {
    setConfig((prev) => ({
      ...prev,
      tanks: [...prev.tanks, ''],
      activeTanks: [...prev.activeTanks, false],
    }))
  }

  const removeTank = (index: number) => {
    setConfig((prev) => {
      const nextTanks = prev.tanks.filter((_, i) => i !== index)
      const nextActive = prev.activeTanks.filter((_, i) => i !== index)
      return { ...prev, tanks: nextTanks, activeTanks: nextActive }
    })
  }

  const updateTankGrade = (index: number, value: string) => {
    setConfig((prev) => {
      const next = [...prev.tanks]
      next[index] = value
      return { ...prev, tanks: next }
    })
  }

  const toggleTankActive = (index: number, active: boolean) => {
    setConfig((prev) => {
      const nextActive = [...prev.activeTanks]
      const grade = prev.tanks[index]
      if (active) {
        prev.tanks.forEach((value, i) => {
          if (value === grade && i !== index) nextActive[i] = false
        })
      }
      nextActive[index] = active
      return { ...prev, activeTanks: nextActive }
    })
  }

  const saveConfig = async () => {
    setStatus(null)
    setIsSaving(true)
    try {
      const payload = isManager ? { activeTanks: config.activeTanks } : config

      const res = await fetch('/api/tanks', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-csrf-token': csrfToken,
        },
        body: JSON.stringify({ data: payload, csrf_token: csrfToken }),
      })

      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw body

      setConfig(body?.data ?? config)
      setStatus({
        type: ACTION_STATUS.SUCCESS,
        message: 'Tank grades updated.',
      })
    } catch (err: any) {
      const message =
        err?.error?.message || err?.message || 'Failed to save tank grades.'
      setStatus({ type: ACTION_STATUS.ERROR, message })
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      <CsrfBootstrap onToken={setCsrfToken} />
      <PageHeader
        title="Tank Grades"
        description="Configure grade names, tank order, and active tank per grade."
        actions={
          <Button variant="primary" onClick={saveConfig} disabled={isSaving}>
            {isSaving ? 'Saving...' : 'Save changes'}
          </Button>
        }
      />

      {status && (
        <Card>
          <CardContent>
            <div
              className={
                status.type === ACTION_STATUS.SUCCESS
                  ? 'text-sm text-emerald-700'
                  : 'text-sm text-red-600'
              }
            >
              {status.message}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-semibold text-[var(--text-primary)]">
                Grades
              </div>
              <div className="text-xs text-[var(--text-muted)]">
                Define product grades used for tanks.
              </div>
            </div>
            <Button variant="secondary" onClick={addGrade} disabled={isManager}>
              Add grade
            </Button>
          </div>

          {isLoading ? (
            <Skeleton className="h-10 w-full" />
          ) : loadError ? (
            <ErrorDetails
              title="Unable to load grades"
              message="Please retry."
              error={loadError}
            />
          ) : config.grades.length === 0 ? (
            <EmptyState
              title="No grades"
              description="Add a grade to begin mapping tanks."
            />
          ) : (
            <div className="overflow-hidden rounded-card border border-border bg-surface-card">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Grade</TableHead>
                    <TableHead>Cloud limit (optional)</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {config.grades.map((grade, index) => (
                    <TableRow key={`${grade}-${index}`}>
                      <TableCell>
                        <Input
                          value={grade}
                          onChange={(event) =>
                            updateGrade(index, event.target.value)
                          }
                          disabled={isManager}
                          placeholder="Grade name"
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          value={
                            config.gradeLimits?.[index] === null ||
                            config.gradeLimits?.[index] === undefined
                              ? ''
                              : String(config.gradeLimits?.[index] ?? '')
                          }
                          onChange={(event) =>
                            updateGradeLimit(index, event.target.value)
                          }
                          disabled={isManager}
                          placeholder="Limit"
                        />
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="destructive"
                          onClick={() => removeGrade(index)}
                          disabled={isManager}
                        >
                          Remove
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-semibold text-[var(--text-primary)]">
                Tanks
              </div>
              <div className="text-xs text-[var(--text-muted)]">
                Order matters; it should match physical tank numbering.
              </div>
            </div>
            <Button variant="secondary" onClick={addTank} disabled={isManager}>
              Add tank
            </Button>
          </div>

          {isLoading ? (
            <Skeleton className="h-10 w-full" />
          ) : loadError ? (
            <ErrorDetails
              title="Unable to load tanks"
              message="Please retry."
              error={loadError}
            />
          ) : config.tanks.length === 0 ? (
            <EmptyState
              title="No tanks"
              description="Add tanks and map them to grades."
            />
          ) : (
            <div className="overflow-hidden rounded-card border border-border bg-surface-card">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Tank</TableHead>
                    <TableHead>Grade</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {config.tanks.map((tank, index) => {
                    const active = Boolean(config.activeTanks?.[index])
                    return (
                      <TableRow key={`tank-${index}`}>
                        <TableCell>Tank {index + 1}</TableCell>
                        <TableCell>
                          <Select
                            value={tank}
                            onChange={(event) =>
                              updateTankGrade(index, event.target.value)
                            }
                            disabled={isManager}
                          >
                            <option value="">Select grade</option>
                            {gradeOptions.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </Select>
                        </TableCell>
                        <TableCell>
                          <label className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
                            <Checkbox
                              checked={active}
                              onChange={(event) =>
                                toggleTankActive(index, event.target.checked)
                              }
                            />
                            {active ? (
                              <Badge variant={STATUS_VARIANT.SUCCESS}>
                                Active
                              </Badge>
                            ) : (
                              <Badge variant={STATUS_VARIANT.NEUTRAL}>
                                Inactive
                              </Badge>
                            )}
                          </label>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="destructive"
                            onClick={() => removeTank(index)}
                            disabled={isManager}
                          >
                            Remove
                          </Button>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
