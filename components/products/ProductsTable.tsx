import { RowActionsMenu } from '@/components/sheets/RowActionsMenu'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

import { ProductListItem } from './products.types'
import {
  formatDate,
  formatPrice,
  statusLabel,
  statusVariant,
} from './products.utils'
import { useProductsUI } from './useProductsUI'

export function ProductsTable({
  products,
  onViewStatus,
  onViewEventLog,
  onResync,
  onEdit,
}: {
  products: ProductListItem[]
  onViewStatus: (p: ProductListItem) => void
  onViewEventLog: (p: ProductListItem) => void
  onResync: (p: ProductListItem) => void
  onEdit: (p: ProductListItem) => void
}) {
  const { showToast } = useProductsUI()

  return (
    <div className="overflow-hidden rounded-card border border-border bg-surface-card">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Product</TableHead>
            <TableHead>Code / SKU</TableHead>
            <TableHead>SKU</TableHead>
            <TableHead>Unit price</TableHead>
            <TableHead>Currency</TableHead>
            <TableHead>Sync status</TableHead>
            <TableHead>Last synced</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>

        <TableBody>
          {products.map((p) => (
            <TableRow key={p.id}>
              <TableCell>
                <div className="font-medium text-[var(--text-primary)]">
                  {p.name}
                </div>
              </TableCell>
              <TableCell className="text-[var(--text-muted)]">
                {p.code}
              </TableCell>
              <TableCell className="text-[var(--text-muted)]">
                {p.sku ?? '—'}
              </TableCell>
              <TableCell>{formatPrice(p.unitPrice)}</TableCell>
              <TableCell className="text-[var(--text-muted)]">
                {p.currency || '—'}
              </TableCell>
              <TableCell>
                <Badge variant={statusVariant(p.lastSyncStatus ?? 'UNKNOWN')}>
                  {statusLabel(p.lastSyncStatus ?? 'UNKNOWN')}
                </Badge>
              </TableCell>
              <TableCell className="text-[var(--text-muted)]">
                {formatDate(p.lastSynced)}
              </TableCell>
              <TableCell className="text-right">
                <RowActionsMenu
                  item={p}
                  actions={[
                    { label: 'Edit', onSelect: onEdit },
                    { label: 'View status', onSelect: onViewStatus },
                    { label: 'View event log', onSelect: onViewEventLog },
                    {
                      label:
                        p.lastSyncStatus === 'FAILED'
                          ? 'Retry sync'
                          : 'Re-sync',
                      onSelect: onResync,
                    },
                  ]}
                />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
