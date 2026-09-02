'use client'

import type { StockMovement } from '@/components/stock/stock.types'

import {
  formatProxyStatus,
  formatStockDateTime,
  formatStockQuantity,
  proxyBadgeVariant,
} from '@/components/stock/stock.helpers'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

type StockMovementHistoryProps = {
  movements: StockMovement[]
  isFiltered: boolean
  retryingId: string | null
  retryEnabled: boolean
  onClearFilter: () => void
  onRetry: (movementId: string) => void
}

export function StockMovementHistory({
  movements,
  isFiltered,
  retryingId,
  retryEnabled,
  onClearFilter,
  onRetry,
}: StockMovementHistoryProps) {
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle>Movement history</CardTitle>
            <CardDescription>
              Local inventory audit trail. Manual and CSV movements show proxy
              transmission status; POS movements are local only.
            </CardDescription>
          </div>
          {isFiltered && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={onClearFilter}
            >
              Show all products
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {movements.length === 0 ? (
          <EmptyState
            title="No stock movements recorded"
            description="Use Stock In or Stock Out, or capture a non-fuel POS sale, to create the first movement."
          />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Product</TableHead>
                  <TableHead>Movement</TableHead>
                  <TableHead className="text-right">Quantity</TableHead>
                  <TableHead>Reference</TableHead>
                  <TableHead>Proxy</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {movements.map((movement) => (
                  <TableRow key={movement.id}>
                    <TableCell>
                      {formatStockDateTime(movement.effectiveAt)}
                    </TableCell>
                    <TableCell>
                      <div className="font-medium">{movement.productName}</div>
                      <div className="text-xs text-[var(--text-muted)]">
                        {movement.productCode}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          movement.movementType === 'STOCK_IN'
                            ? 'success'
                            : 'warn'
                        }
                      >
                        {movement.movementType === 'STOCK_IN'
                          ? 'Stock in'
                          : 'Stock out'}
                      </Badge>
                      <div className="mt-1 text-xs text-[var(--text-muted)]">
                        {movement.reason}
                      </div>
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {movement.movementType === 'STOCK_IN' ? '+' : '-'}
                      {formatStockQuantity(
                        movement.quantity,
                        movement.unitOfMeasure,
                      )}
                    </TableCell>
                    <TableCell>
                      <div>
                        {movement.documentReference || movement.documentId}
                      </div>
                      {movement.sourceType === 'POS_TRANSACTION' && (
                        <div className="text-xs text-[var(--text-muted)]">
                          POS transaction
                          {movement.sourceAction
                            ? ` · ${movement.sourceAction.toLowerCase()}`
                            : ''}
                        </div>
                      )}
                      {movement.sourceType === 'CSV_IMPORT' && (
                        <div className="text-xs text-[var(--text-muted)]">
                          CSV import
                        </div>
                      )}
                      {movement.remarks && (
                        <div className="max-w-xs truncate text-xs text-[var(--text-muted)]">
                          {movement.remarks}
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={proxyBadgeVariant(movement.proxyStatus)}
                        dot
                      >
                        {formatProxyStatus(movement.proxyStatus)}
                      </Badge>
                      {movement.proxyError && (
                        <div className="mt-1 max-w-xs text-xs text-[var(--status-error-text)]">
                          {movement.proxyError}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {(movement.proxyStatus === 'FAILED' ||
                        movement.proxyStatus === 'PENDING') &&
                        movement.sourceType !== 'POS_TRANSACTION' && (
                          <Button
                            type="button"
                            size="sm"
                            variant="secondary"
                            disabled={
                              retryingId === movement.id || !retryEnabled
                            }
                            onClick={() => onRetry(movement.id)}
                          >
                            {retryingId === movement.id
                              ? 'Sending...'
                              : movement.proxyStatus === 'PENDING'
                                ? 'Send'
                                : 'Retry'}
                          </Button>
                        )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
