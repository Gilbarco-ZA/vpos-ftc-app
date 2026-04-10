import type { ListTransactionsFilterOptions } from './transaction.sql'

export type ListTransactionsRepoOptions = ListTransactionsFilterOptions

export type TransactionCatalogProduct = {
  id: string
  externalProductId: string | null
  productCode: string | null
  productName: string
  unitPrice: number
  currency: string | null
  unitOfMeasure: string | null
  categoryId: string | null
  categoryName: string | null
  categoryIcon: string | null
  categoryImagePath: string | null
}

export type EditableTransactionLine = {
  id: string
  productId: string
  quantity: number
  unitPrice: number
  lineTotal: number
  productCode: string | null
  productName: string | null
  currency: string | null
}

export type FuelSelectionInput = {
  tankId?: string | null
  nozzleId?: string | null
  nozzleNumber?: number | null
  gradeId?: string | null
  gradeName?: string | null
  pumpId?: string | null
}

export type UpsertTransactionLineInput = {
  productId: string
  quantity: number
  unitPrice?: number | null
}

export type ManualTransactionInput = {
  pumpNumber: number
  posReference?: string | null
  transactionDateTime?: string | null
  lines: UpsertTransactionLineInput[]
  fuelSelection?: FuelSelectionInput | null
}
