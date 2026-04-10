import { RemoteSheet, useRemoteResource } from '@/components/sheets/RemoteSheet'
import { ErrorDetails } from '@/components/ui/error-details'

import { ProductListItem, ProductStatusPayload } from './products.types'

export function ProductStatusSheet({
  product,
  onClose,
  onResync,
}: {
  product: ProductListItem | null
  onClose: () => void
  onResync: () => void
}) {
  const { loading, error, data, refetch } =
    useRemoteResource<ProductStatusPayload>(
      product?.id ?? null,
      (id) => `/api/products/${encodeURIComponent(id)}/status`,
      { parse: (body) => (body?.data ?? body) as ProductStatusPayload },
    )

  return (
    <RemoteSheet
      open={Boolean(product)}
      onClose={onClose}
      title="Product status"
      onRetry={refetch}
      onPrimary={onResync}
      primaryLabel="Re-sync"
    >
      <div className="space-y-3 text-sm">
        {loading && (
          <div className="text-[var(--text-muted)]">Loading status…</div>
        )}
        {Boolean(error) && (
          <ErrorDetails
            title="We couldn’t load the status right now."
            message="Check your connection and try again."
            error={error}
          />
        )}
        {!loading && !error && data && (
          <div className="space-y-3">
            <FieldRow label="Status" value={data.status ?? '—'} strong />
            <FieldRow
              label="Last status time"
              value={data.lastStatusTime ?? '—'}
            />
            <FieldRow
              label="Revenue authority reference"
              value={data.revenueAuthorityReference ?? '—'}
            />
            <FieldRow
              label="Revenue authority message"
              value={data.revenueAuthorityMessage ?? '—'}
            />
            <FieldRow
              label="Message"
              value={data.message ?? data.error ?? '—'}
            />
          </div>
        )}
      </div>
    </RemoteSheet>
  )
}

function FieldRow({
  label,
  value,
  strong,
}: {
  label: string
  value: string
  strong?: boolean
}) {
  return (
    <div>
      <div className="text-xs text-[var(--text-muted)]">{label}</div>
      <div
        className={
          strong
            ? 'font-semibold text-[var(--text-primary)]'
            : 'text-[var(--text-secondary)]'
        }
      >
        {value}
      </div>
    </div>
  )
}
