import type { DecimalSettings } from '@/src/shared/receipts/decimalSettings'

export type PosCatalogCategory = {
  id: string
  code: string
  name: string
  description?: string | null
  icon?: string | null
  imagePath?: string | null
  productCount?: number | null
}

export type PosCatalogProduct = {
  id: string
  externalProductId?: string | null
  productCode?: string | null
  productName: string
  unitPrice: number
  currency?: string | null
  unitOfMeasure?: string | null
  categoryId?: string | null
  categoryName?: string | null
  categoryIcon?: string | null
  categoryImagePath?: string | null
}

export type PosCatalogResponse = {
  products: PosCatalogProduct[]
  categories: PosCatalogCategory[]
  decimals: DecimalSettings
  transactionsHref: string
}
