'use client'

import type { ProductStatus } from '@/components/products/products.types'

import { statusOptions } from '@/components/products/products.utils'
import { Button } from '@/components/ui/button'
import { FiltersRow } from '@/components/ui/filters-row'
import { Select } from '@/components/ui/select'

export function ProductsFiltersRow({
  search,
  status,
  onSearchChange,
  onStatusChange,
  onRefresh,
}: {
  search: string
  status: ProductStatus | 'ALL'
  onSearchChange: (value: string) => void
  onStatusChange: (value: ProductStatus | 'ALL') => void
  onRefresh: () => void
}) {
  return (
    <FiltersRow>
      <FiltersRow.Search
        value={search}
        onChange={onSearchChange}
        placeholder="Search by name, code, or SKU"
      />
      <FiltersRow.Slot>
        <Select
          value={status}
          onChange={(event) =>
            onStatusChange(event.target.value as ProductStatus | 'ALL')
          }
        >
          {statusOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>
      </FiltersRow.Slot>
      <Button variant="secondary" onClick={onRefresh}>
        Refresh
      </Button>
    </FiltersRow>
  )
}
