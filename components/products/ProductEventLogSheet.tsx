import { RemoteSheet, useRemoteResource } from '@/components/sheets/RemoteSheet'
import { EventLogPanel } from '@/components/ui/event-log-panel'

import { ProductEventLogItem, ProductListItem } from './products.types'

export function ProductEventLogSheet({
  product,
  onClose,
}: {
  product: ProductListItem | null
  onClose: () => void
}) {
  const { loading, error, data, refetch } = useRemoteResource<
    ProductEventLogItem[]
  >(
    product?.id ?? null,
    (id) => `/api/products/${encodeURIComponent(id)}/event-log`,
    {
      parse: (body) => {
        const d = body?.data ?? body
        const list = Array.isArray(d?.events)
          ? d.events
          : Array.isArray(d)
            ? d
            : []
        return [...list].sort((a, b) =>
          String(b?.dateTime ?? '').localeCompare(String(a?.dateTime ?? '')),
        )
      },
    },
  )

  return (
    <RemoteSheet
      open={Boolean(product)}
      onClose={onClose}
      title="Event log"
      onRetry={refetch}
    >
      <EventLogPanel
        events={data ?? []}
        loading={loading}
        error={error}
        emptyMessage="This product has no sync events recorded."
      />
    </RemoteSheet>
  )
}
