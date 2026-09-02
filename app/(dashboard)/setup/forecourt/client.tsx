'use client'

import type { ReactNode } from 'react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'

import { STATUS_VARIANT } from '@/src/shared/status/ui'

import { PageHeader } from '@/components/layout/page-header'
import PssConfigurationVerification from '@/components/setup/PssConfigurationVerification'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { ErrorDetails } from '@/components/ui/error-details'
import { Skeleton } from '@/components/ui/skeleton'

type SetupCounts = {
  products: number
  tanks: number
  pumps: number
  nozzles: number
}

type Step = {
  id: number
  title: string
  description: string
  required: (counts: SetupCounts) => boolean
  action: ReactNode
}

const defaultCounts: SetupCounts = {
  products: 0,
  tanks: 0,
  pumps: 0,
  nozzles: 0,
}

export default function ForecourtSetupClient() {
  const [counts, setCounts] = useState<SetupCounts>(defaultCounts)
  const [currentStep, setCurrentStep] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<unknown>(null)

  const loadCounts = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/setup/forecourt', { cache: 'no-store' })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw body
      setCounts(body?.data ?? defaultCounts)
    } catch (err) {
      setError(err)
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    queueMicrotask(() => {
      loadCounts()
    })
  }, [loadCounts])

  const steps: Step[] = useMemo(
    () => [
      {
        id: 1,
        title: 'Products',
        description: 'Ensure at least one product exists for tank assignments.',
        required: (data) => data.products > 0,
        action: (
          <Button asChild variant="secondary">
            <Link href="/admin/products">View products</Link>
          </Button>
        ),
      },
      {
        id: 2,
        title: 'Tanks',
        description: 'Create station tanks and link them to products.',
        required: (data) => data.tanks > 0,
        action: (
          <Button asChild variant="secondary">
            <Link href="/settings/tanks">Manage tanks</Link>
          </Button>
        ),
      },
      {
        id: 3,
        title: 'Pumps',
        description: 'Create pumps with unique pump numbers.',
        required: (data) => data.pumps > 0,
        action: (
          <Button asChild variant="secondary">
            <Link href="/settings/pumps">Manage pumps</Link>
          </Button>
        ),
      },
      {
        id: 4,
        title: 'Nozzles',
        description: 'Assign tanks to each pump nozzle (grade).',
        required: (data) => data.nozzles > 0,
        action: (
          <Button asChild variant="secondary">
            <Link href="/settings/pumps">Assign nozzles</Link>
          </Button>
        ),
      },
    ],
    [],
  )

  const activeStep = steps[currentStep]
  const isActiveComplete = activeStep.required(counts)
  const allComplete = steps.every((step) => step.required(counts))

  const goNext = () => {
    if (!isActiveComplete) return
    setCurrentStep((prev) => Math.min(prev + 1, steps.length - 1))
  }

  const goPrev = () => {
    setCurrentStep((prev) => Math.max(prev - 1, 0))
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Forecourt Setup"
        description="Complete the guided steps to link products, tanks, pumps, and nozzles."
        actions={
          <>
            <Button asChild variant="secondary">
              <Link href="/setup/forecourt/pricing">Scheduled prices</Link>
            </Button>
            <Button variant="secondary" onClick={loadCounts}>
              Refresh status
            </Button>
          </>
        }
      />

      <PssConfigurationVerification />

      <Card>
        <CardContent className="space-y-4">
          {isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : error ? (
            <ErrorDetails
              title="Unable to load setup"
              message="Please retry."
              error={error}
            />
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {steps.map((step, index) => {
                const complete = step.required(counts)
                return (
                  <div
                    key={step.id}
                    className={
                      'rounded-card border border-border bg-surface-card p-4 ' +
                      (index === currentStep ? 'ring-2 ring-black/10' : '')
                    }
                  >
                    <div className="flex items-center justify-between">
                      <div className="text-sm font-semibold text-[var(--text-primary)]">
                        Step {step.id}: {step.title}
                      </div>
                      <Badge
                        variant={
                          complete
                            ? STATUS_VARIANT.SUCCESS
                            : STATUS_VARIANT.INFO
                        }
                      >
                        {complete ? 'Complete' : 'Pending'}
                      </Badge>
                    </div>
                    <p className="mt-2 text-xs text-[var(--text-muted)]">
                      {step.description}
                    </p>
                    <div className="mt-3">{step.action}</div>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {!isLoading &&
        !error &&
        steps.length > 0 &&
        (allComplete ? (
          <Card>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <div className="text-sm font-semibold text-[var(--text-primary)]">
                    Forecourt setup complete
                  </div>
                  <p className="text-xs text-[var(--text-muted)]">
                    Products, tanks, pumps and nozzles are configured.
                  </p>
                </div>
                <Badge variant={STATUS_VARIANT.SUCCESS}>Setup complete</Badge>
              </div>

              <div className="grid gap-2 md:grid-cols-4">
                <div className="rounded-card border border-border bg-surface-card p-3">
                  <div className="text-xs text-[var(--text-muted)]">
                    Products
                  </div>
                  <div className="text-lg font-semibold">{counts.products}</div>
                </div>
                <div className="rounded-card border border-border bg-surface-card p-3">
                  <div className="text-xs text-[var(--text-muted)]">Tanks</div>
                  <div className="text-lg font-semibold">{counts.tanks}</div>
                </div>
                <div className="rounded-card border border-border bg-surface-card p-3">
                  <div className="text-xs text-[var(--text-muted)]">Pumps</div>
                  <div className="text-lg font-semibold">{counts.pumps}</div>
                </div>
                <div className="rounded-card border border-border bg-surface-card p-3">
                  <div className="text-xs text-[var(--text-muted)]">
                    Nozzles
                  </div>
                  <div className="text-lg font-semibold">{counts.nozzles}</div>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button asChild variant="secondary">
                  <Link href="/settings/tanks">Tanks</Link>
                </Button>
                <Button asChild variant="secondary">
                  <Link href="/settings/pumps">Pumps</Link>
                </Button>
                <Button asChild variant="secondary">
                  <Link href="/admin/products">Products</Link>
                </Button>
                <Button asChild variant="secondary">
                  <Link href="/setup/forecourt/pricing">Scheduled prices</Link>
                </Button>
                <Button variant="secondary" onClick={loadCounts}>
                  Refresh status
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="space-y-4">
              <div>
                <div className="text-sm font-semibold text-[var(--text-primary)]">
                  Step {activeStep.id}: {activeStep.title}
                </div>
                <p className="text-xs text-[var(--text-muted)]">
                  {activeStep.description}
                </p>
              </div>

              {!activeStep.required(counts) && (
                <EmptyState
                  title="Complete this step"
                  description="Use the action below, then refresh status to continue."
                  action={activeStep.action}
                />
              )}

              <div className="flex items-center justify-between">
                <Button
                  variant="secondary"
                  onClick={goPrev}
                  disabled={currentStep === 0}
                >
                  Back
                </Button>
                <Button
                  variant="primary"
                  onClick={goNext}
                  disabled={
                    !isActiveComplete || currentStep >= steps.length - 1
                  }
                >
                  Next
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
    </div>
  )
}
