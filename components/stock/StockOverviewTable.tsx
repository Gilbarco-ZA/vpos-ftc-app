'use client'

import type {
  StockMovementType,
  StockProduct,
} from '@/components/stock/stock.types'

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
import { Input } from '@/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

type StockOverviewTableProps = {
  products: StockProduct[]
  isLoading: boolean
  search: string
  onSearchChange: (value: string) => void
  onHistory: (productRecordId: string) => void
  onMovement: (movementType: StockMovementType, product?: StockProduct) => void
}

export function StockOverviewTable({
  products,
  isLoading,
  search,
  onSearchChange,
  onHistory,
  onMovement,
}: StockOverviewTableProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Current product stock</CardTitle>
        <CardDescription>
          Fuel-category products are intentionally excluded and remain under
          tank stock management.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Input
          type="search"
          value={search}
          placeholder="Search product, SKU, code or category"
          onChange={(event) => onSearchChange(event.target.value)}
        />

        {isLoading ? (
          <div className="py-8 text-center text-sm text-[var(--text-muted)]">
            Loading product stock...
          </div>
        ) : products.length === 0 ? (
          <EmptyState
            title="No non-fuel products found"
            description="Create or recategorize products before recording stock movements."
          />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead className="text-right">Available</TableHead>
                  <TableHead>Last movement</TableHead>
                  <TableHead>Proxy</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {products.map((product) => (
                  <TableRow key={product.id}>
                    <TableCell>
                      <div className="font-medium text-[var(--text-primary)]">
                        {product.productName}
                      </div>
                      <div className="text-xs text-[var(--text-muted)]">
                        {product.productCode}
                        {product.sku ? ` · SKU ${product.sku}` : ''}
                      </div>
                    </TableCell>
                    <TableCell>
                      {product.categoryName || product.categoryCode || '—'}
                    </TableCell>
                    <TableCell className="text-right font-semibold">
                      {formatStockQuantity(
                        product.availableQuantity,
                        product.unitOfMeasure,
                      )}
                    </TableCell>
                    <TableCell>
                      <div>{formatStockDateTime(product.lastMovementAt)}</div>
                      {product.lastMovementType && (
                        <div className="text-xs text-[var(--text-muted)]">
                          {product.lastMovementType === 'STOCK_IN'
                            ? 'Stock in'
                            : 'Stock out'}
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={proxyBadgeVariant(product.lastProxyStatus)}
                        dot
                      >
                        {formatProxyStatus(product.lastProxyStatus)}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap justify-end gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() => onHistory(product.id)}
                        >
                          History
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          disabled={product.availableQuantity <= 0}
                          onClick={() => onMovement('STOCK_OUT', product)}
                        >
                          Out
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="primary"
                          onClick={() => onMovement('STOCK_IN', product)}
                        >
                          In
                        </Button>
                      </div>
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
