'use client'

import { STATUS_VARIANT } from '@/src/shared/status/ui'

import { Badge } from '@/components/ui/badge'

const toArray = (value: unknown): any[] => (Array.isArray(value) ? value : [])

const asNumber = (value: unknown): number | null => {
  if (value == null || value === '') return null
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

const formatNumber = (value: unknown, decimals = 2) => {
  const number = asNumber(value)
  if (number == null) return '—'
  return number.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals,
  })
}

const formatTimestamp = (value: unknown) => {
  if (!value) return 'No timestamp available'
  const date = new Date(String(value))
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString()
}

const statusLabel = (value: unknown) => {
  const text = String(value ?? '')
    .trim()
    .replaceAll('_', ' ')
  if (!text) return 'Unknown'
  return text.charAt(0).toUpperCase() + text.slice(1)
}

const deliveryVariant = (status: unknown) => {
  const normalized = String(status ?? '').toLowerCase()
  if (normalized === 'idle' || normalized === 'completed') {
    return STATUS_VARIANT.SUCCESS
  }
  if (normalized.includes('progress') || normalized.includes('starting')) {
    return STATUS_VARIANT.NEUTRAL
  }
  return STATUS_VARIANT.INFO
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded border bg-[var(--surface-base)] p-3">
      <div className="text-xs uppercase tracking-wide text-[var(--text-muted)]">
        {label}
      </div>
      <div className="mt-1 text-lg font-semibold text-[var(--text-primary)]">
        {value}
      </div>
    </div>
  )
}

function RawPayload({ label, value }: { label: string; value: unknown }) {
  return (
    <details className="rounded border bg-[var(--surface-base)] p-3">
      <summary className="cursor-pointer text-sm font-medium">{label}</summary>
      <pre className="mt-3 max-h-80 overflow-auto whitespace-pre-wrap break-words text-xs text-[var(--text-secondary)]">
        {JSON.stringify(value ?? null, null, 2)}
      </pre>
    </details>
  )
}

export function DeliveryDataSummary({ data }: { data: any }) {
  if (!data) {
    return (
      <div className="rounded border bg-[var(--surface-muted)] p-4 text-sm text-[var(--text-muted)]">
        Refresh delivery data to view the current forecourt delivery state.
      </div>
    )
  }

  const payload = data?.data ?? data
  const normalized = payload?.normalizedSiteDeliveryStatus ?? null
  const status = normalized?.status ?? 'unknown'
  const errors = toArray(payload?.errors)
  const deliveries = toArray(payload?.normalizedDeliveries)
  const activeDeliveries = toArray(normalized?.tankDeliveries)
  const ticketedDeliveries = toArray(normalized?.tankTicketedDeliveries)
  const clearCandidates = toArray(normalized?.clearCandidates)
  const reportSeq = normalized?.deliveryReportSeqNo ?? '—'

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-sm font-semibold">Delivery status</div>
          <div className="text-xs text-[var(--text-secondary)]">
            Live DOMS site-delivery summary
          </div>
        </div>
        <Badge variant={deliveryVariant(status)}>{statusLabel(status)}</Badge>
      </div>

      <div className="grid grid-cols-2 gap-2 xl:grid-cols-4">
        <Metric label="Report sequence" value={String(reportSeq)} />
        <Metric
          label="Active deliveries"
          value={activeDeliveries.length || deliveries.length}
        />
        <Metric label="Ticketed deliveries" value={ticketedDeliveries.length} />
        <Metric label="Ready to clear" value={clearCandidates.length} />
      </div>

      {status === 'idle' && deliveries.length === 0 ? (
        <div className="rounded border border-green-500/30 bg-green-500/5 p-3 text-sm text-green-800">
          The controller is responding. No delivery is currently in progress and
          no delivery report is waiting to be cleared.
        </div>
      ) : null}

      {errors.length ? (
        <div className="rounded border border-red-500/30 bg-red-500/5 p-3 text-sm text-red-800">
          <div className="font-semibold">Delivery data warnings</div>
          <ul className="mt-1 list-disc space-y-1 pl-5">
            {errors.map((error: any, index: number) => (
              <li key={index}>{String(error?.message ?? error)}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {deliveries.length ? (
        <div className="overflow-auto rounded border">
          <table className="min-w-full text-left text-xs">
            <thead className="bg-[var(--surface-muted)] text-[var(--text-muted)]">
              <tr>
                <th className="px-2 py-2">Tank gauge</th>
                <th className="px-2 py-2">Status</th>
                <th className="px-2 py-2">Delivered volume</th>
                <th className="px-2 py-2">Updated</th>
              </tr>
            </thead>
            <tbody>
              {deliveries.map((delivery: any, index: number) => (
                <tr
                  key={`${delivery?.tgId ?? 'delivery'}-${index}`}
                  className="border-t"
                >
                  <td className="px-2 py-2">{delivery?.tgId ?? '—'}</td>
                  <td className="px-2 py-2">
                    {statusLabel(delivery?.status ?? delivery?.state)}
                  </td>
                  <td className="px-2 py-2">
                    {formatNumber(
                      delivery?.tankDeliveredVol ?? delivery?.deliveredVolume,
                      3,
                    )}{' '}
                    L
                  </td>
                  <td className="px-2 py-2">
                    {formatTimestamp(
                      delivery?.updatedAt ?? delivery?.completedAt,
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      <RawPayload label="Show raw delivery response" value={data} />
    </div>
  )
}

export function TankGaugeDataSummary({
  data,
  configuredGrades,
}: {
  data: any
  configuredGrades: string[]
}) {
  if (!data) {
    return (
      <div className="rounded border bg-[var(--surface-muted)] p-4 text-sm text-[var(--text-muted)]">
        Refresh tank gauge data to view the latest readings.
      </div>
    )
  }

  const payload = data?.data ?? data
  const normalized = toArray(payload?.normalized)
  const responses = toArray(payload?.responses)
  const errors = toArray(payload?.errors)
  const snapshotError = payload?.tankStatusSnapshot?.error

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-sm font-semibold">Tank gauge readings</div>
          <div className="text-xs text-[var(--text-secondary)]">
            {responses.length} controller response
            {responses.length === 1 ? '' : 's'} received
          </div>
        </div>
        <Badge
          variant={
            errors.length ? STATUS_VARIANT.NEUTRAL : STATUS_VARIANT.SUCCESS
          }
        >
          {errors.length
            ? `${errors.length} warning(s)`
            : 'Controller responding'}
        </Badge>
      </div>

      {snapshotError ? (
        <div className="rounded border border-amber-500/30 bg-amber-500/5 p-3 text-sm text-amber-900">
          <div className="font-semibold">Tank status summary unavailable</div>
          <div className="mt-1">
            The optional aggregate tank-status request timed out, but the
            individual tank gauge readings below were received successfully.
          </div>
          <div className="mt-1 text-xs opacity-80">{String(snapshotError)}</div>
        </div>
      ) : null}

      {errors.length ? (
        <div className="rounded border border-red-500/30 bg-red-500/5 p-3 text-sm text-red-800">
          <ul className="list-disc space-y-1 pl-5">
            {errors.map((error: any, index: number) => (
              <li key={index}>{String(error?.message ?? error)}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {normalized.length ? (
        <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
          {normalized.map((tank: any, index: number) => {
            const tgId = String(tank?.tgId ?? index + 1)
            const numericTgId = Number.parseInt(tgId, 10)
            const grade =
              configuredGrades[
                Number.isFinite(numericTgId) ? numericTgId - 1 : index
              ] ?? ''
            const gross = asNumber(tank?.tankGrossObservedVol) ?? 0
            const shell = asNumber(tank?.tankShellCapacity) ?? 0
            const available = asNumber(tank?.tankAvailableRoom) ?? 0
            const hasInventory = gross > 0 || shell > 0 || available > 0
            const fillPercent =
              shell > 0 ? Math.min(100, (gross / shell) * 100) : 0

            return (
              <div
                key={tgId}
                className="space-y-3 rounded border bg-[var(--surface-base)] p-3"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <div className="font-semibold">Tank {tgId}</div>
                    <div className="text-xs text-[var(--text-secondary)]">
                      {grade
                        ? `Assigned grade: ${grade}`
                        : 'No grade label assigned'}
                    </div>
                  </div>
                  <Badge
                    variant={
                      hasInventory
                        ? STATUS_VARIANT.SUCCESS
                        : STATUS_VARIANT.INFO
                    }
                  >
                    {hasInventory ? 'Live inventory' : 'No live inventory'}
                  </Badge>
                </div>

                {shell > 0 ? (
                  <div>
                    <div className="mb-1 flex justify-between text-xs text-[var(--text-secondary)]">
                      <span>Fill level</span>
                      <span>{formatNumber(fillPercent, 1)}%</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded bg-[var(--surface-muted)]">
                      <div
                        className="h-full bg-[var(--accent)]"
                        style={{ width: `${fillPercent}%` }}
                      />
                    </div>
                  </div>
                ) : null}

                <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                  <div>
                    <div className="text-xs text-[var(--text-muted)]">
                      Product height
                    </div>
                    <div>{formatNumber(tank?.tankProductLevel, 3)} mm</div>
                  </div>
                  <div>
                    <div className="text-xs text-[var(--text-muted)]">
                      Water height
                    </div>
                    <div>{formatNumber(tank?.tankWaterLevel, 3)} mm</div>
                  </div>
                  <div>
                    <div className="text-xs text-[var(--text-muted)]">
                      Gross volume
                    </div>
                    <div>{formatNumber(gross, 3)} L</div>
                  </div>
                  <div>
                    <div className="text-xs text-[var(--text-muted)]">
                      Standard volume
                    </div>
                    <div>{formatNumber(tank?.tankGrossStdVol, 3)} L</div>
                  </div>
                  <div>
                    <div className="text-xs text-[var(--text-muted)]">
                      Available room
                    </div>
                    <div>{formatNumber(available, 3)} L</div>
                  </div>
                  <div>
                    <div className="text-xs text-[var(--text-muted)]">
                      Water volume
                    </div>
                    <div>{formatNumber(tank?.tankWaterVol, 3)} L</div>
                  </div>
                  <div>
                    <div className="text-xs text-[var(--text-muted)]">
                      Average temperature
                    </div>
                    <div>{formatNumber(tank?.tankAverageTempC, 2)} °C</div>
                  </div>
                  <div>
                    <div className="text-xs text-[var(--text-muted)]">
                      Product density
                    </div>
                    <div>{formatNumber(tank?.tankProductDensity, 3)}</div>
                  </div>
                  <div>
                    <div className="text-xs text-[var(--text-muted)]">
                      Pressure
                    </div>
                    <div>{formatNumber(tank?.tankPressure, 3)}</div>
                  </div>
                  <div>
                    <div className="text-xs text-[var(--text-muted)]">
                      Last update
                    </div>
                    <div>{formatTimestamp(tank?.tankDataLastUpdateAt)}</div>
                  </div>
                </div>

                {!hasInventory ? (
                  <div className="rounded border bg-[var(--surface-muted)] p-2 text-xs text-[var(--text-secondary)]">
                    The tank gauge responded, but all inventory fields are zero
                    and no measurement timestamp was supplied.
                  </div>
                ) : null}
              </div>
            )
          })}
        </div>
      ) : (
        <div className="rounded border bg-[var(--surface-muted)] p-3 text-sm text-[var(--text-secondary)]">
          No normalized tank gauge rows were returned.
        </div>
      )}

      <RawPayload label="Show raw tank gauge response" value={data} />
    </div>
  )
}
