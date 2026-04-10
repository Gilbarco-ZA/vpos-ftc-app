import Link from 'next/link'

import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { FormField } from '@/components/ui/form-field'

type SetupStep = {
  key: string
  label: string
}

type SetupCurrent = {
  siteProfile: any | null
  tanks: any | null
  setupComplete: boolean
  setupStep?: string | null
  setupUpdatedAt?: string | null
  products: { count: number }
  printer: { configured: boolean; configs?: any[] }
  pumps: { config: any | null; liveState: any }
}

type PumpDiag = {
  pumps: number
  nozzles: number
  updatedAt?: number
  ageMs: number | null
}

export const SetupCard = ({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) => (
  <Card className="space-y-3 p-5">
    <h2 className="text-lg font-semibold text-[var(--text-primary)]">
      {title}
    </h2>
    {children}
  </Card>
)

export const Field = ({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) => <FormField label={label}>{children}</FormField>

export const RequirementRow = ({
  ok,
  label,
  detail,
}: {
  ok: boolean
  label: string
  detail?: string
}) => (
  <div className="flex items-start gap-2 text-sm">
    <span
      className={`mt-0.5 inline-flex h-4 w-4 items-center justify-center rounded-full border text-[10px] ${
        ok
          ? 'border-green-500 text-green-600'
          : 'border-[var(--border-default)] text-[var(--text-muted)]'
      }`}
    >
      {ok ? '✓' : '•'}
    </span>
    <div>
      <div
        className={
          ok ? 'text-[var(--text-primary)]' : 'text-[var(--text-secondary)]'
        }
      >
        {label}
      </div>
      {detail && (
        <div className="text-xs text-[var(--text-muted)]">{detail}</div>
      )}
    </div>
  </div>
)

export const SetupOverviewSection = ({
  steps,
  activeStep,
  maxUnlockedStepIndex,
  onStepSelect,
  current,
  pumpFreshness,
  pumpDiag,
  loading,
  onRefresh,
  onRefreshProducts,
  onRefreshPumps,
}: {
  steps: readonly SetupStep[]
  activeStep: number
  maxUnlockedStepIndex: number
  onStepSelect: (index: number) => void
  current: SetupCurrent | null
  pumpFreshness: string
  pumpDiag: PumpDiag
  loading: boolean
  onRefresh: () => void
  onRefreshProducts: () => void
  onRefreshPumps: () => void
}) => {
  return (
    <SetupCard title="0) Current configuration">
      <div className="mb-3 flex flex-wrap gap-2 text-xs">
        {steps.map((s, i) => {
          const isCompleted = i < activeStep || i < maxUnlockedStepIndex
          const isCurrent = i === activeStep
          const isLocked = i > maxUnlockedStepIndex

          return (
            <Button
              key={s.key}
              type="button"
              variant={isCurrent ? 'primary' : 'secondary'}
              size="sm"
              disabled={isLocked}
              onClick={() => onStepSelect(i)}
              className={[
                'h-auto rounded-full px-3 py-1 text-left text-xs transition',
                isCurrent ? '' : isCompleted ? 'bg-surface-muted' : '',
                isLocked ? 'text-[var(--text-muted)]' : '',
              ].join(' ')}
            >
              {i + 1}. {s.label}
            </Button>
          )
        })}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border bg-[var(--surface-muted)] p-3 text-sm">
          <div>
            <b>Site profile:</b>{' '}
            {current?.siteProfile ? 'configured' : 'missing'}
          </div>
          <div>
            <b>Tanks:</b> {current?.tanks ? 'configured' : 'missing'}
          </div>
          <div>
            <b>Products:</b> {current?.products?.count ?? 0}
          </div>
          <div>
            <b>Pumps config:</b>{' '}
            {current?.pumps?.config ? 'configured' : 'missing'}
          </div>
          <div>
            <b>Printer:</b>{' '}
            {current?.printer?.configured ? 'configured' : 'missing'}
          </div>
          <div>
            <b>Pump feed:</b> {pumpFreshness}
          </div>
          <div>
            <b>Setup step:</b> {current?.setupStep || '—'}{' '}
            {current?.setupUpdatedAt ? `(${current.setupUpdatedAt})` : ''}
          </div>
          <div>
            <b>Setup complete:</b> {current?.setupComplete ? 'yes' : 'no'}
          </div>
        </div>

        <div className="rounded-xl border bg-[var(--surface-muted)] p-3 text-sm">
          <div className="mb-2 font-semibold">Diagnostics</div>
          <div>
            <b>Pumps detected:</b> {pumpDiag.pumps}
          </div>
          <div>
            <b>Nozzles detected:</b> {pumpDiag.nozzles}
          </div>
          <div>
            <b>Last update:</b>{' '}
            {pumpDiag.updatedAt
              ? new Date(pumpDiag.updatedAt).toLocaleString()
              : '—'}
          </div>
          <div>
            <b>Feed age:</b>{' '}
            {pumpDiag.ageMs != null
              ? `${Math.round(pumpDiag.ageMs / 1000)}s`
              : '—'}
          </div>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <Button variant="secondary" onClick={onRefresh} disabled={loading}>
          Refresh
        </Button>
        <Button
          variant="secondary"
          onClick={onRefreshProducts}
          disabled={loading}
        >
          Refresh products
        </Button>
        <Button variant="secondary" onClick={onRefreshPumps} disabled={loading}>
          Refresh pump state
        </Button>
        <Button asChild variant="secondary" size="sm">
          <Link href="/admin/products">Products</Link>
        </Button>
        <Button asChild variant="secondary" size="sm">
          <Link href="/admin/config">Devices</Link>
        </Button>
        <Button asChild variant="secondary" size="sm">
          <Link href="/pumps">Pumps</Link>
        </Button>
      </div>
    </SetupCard>
  )
}
