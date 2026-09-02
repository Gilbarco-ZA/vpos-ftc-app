import type { ProductCreateInput } from '@/src/modules/products/infrastructure/validators/product.schemas'
import type { StockUpdateMode } from '@/src/modules/stock/domain/stockMovement'

import { createProductSchema } from '@/src/modules/products/infrastructure/validators/product.schemas'
import { isFuelProduct } from '@/src/modules/stock/domain/stockMovement'

export const PRODUCT_IMPORT_CSV_HEADERS = [
  'productId',
  'productCode',
  'productName',
  'productClassCode',
  'productTypeCode',
  'unitPrice',
  'unitCost',
  'currency',
  'taxRate',
  'taxCode',
  'category',
  'sku',
  'barcode',
  'unitOfMeasure',
  'unitOfPackaging',
  'packSize',
  'commodityCode',
  'hazardousIndicator',
  'stockQuantity',
  'stockUpdateMode',
] as const

export type ProductImportCsvHeader = (typeof PRODUCT_IMPORT_CSV_HEADERS)[number]

export type ProductCsvImportRow = {
  rowNumber: number
  product: ProductCreateInput
  categoryReference: string
  stockQuantity: number | null
  stockUpdateMode: StockUpdateMode | null
}

export type ProductCsvParseResult = {
  rows: ProductCsvImportRow[]
  errors: string[]
}

export type ProductImportCategory = {
  id: string
  code: string
  name: string
}

const MAX_IMPORT_ROWS = 1000

const parseCsvRecords = (text: string): string[][] => {
  const records: string[][] = []
  let record: string[] = []
  let field = ''
  let quoted = false

  const source = text.replace(/^\uFEFF/, '')
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index]

    if (quoted) {
      if (char === '"') {
        if (source[index + 1] === '"') {
          field += '"'
          index += 1
        } else {
          quoted = false
        }
      } else {
        field += char
      }
      continue
    }

    if (char === '"') {
      quoted = true
      continue
    }
    if (char === ',') {
      record.push(field)
      field = ''
      continue
    }
    if (char === '\n') {
      record.push(field.replace(/\r$/, ''))
      records.push(record)
      record = []
      field = ''
      continue
    }
    field += char
  }

  if (quoted) {
    throw new Error('CSV contains an unterminated quoted field.')
  }

  if (field.length > 0 || record.length > 0) {
    record.push(field.replace(/\r$/, ''))
    records.push(record)
  }

  return records.filter((cells) => cells.some((cell) => cell.trim() !== ''))
}

const parseRequiredNumber = (
  value: string,
  field: string,
  rowNumber: number,
  errors: string[],
): number => {
  const parsed = Number(value)
  if (!value.trim() || !Number.isFinite(parsed) || parsed < 0) {
    errors.push(`Row ${rowNumber}: ${field} must be a non-negative number.`)
    return 0
  }
  return parsed
}

const parseOptionalNumber = (
  value: string,
  field: string,
  rowNumber: number,
  errors: string[],
): number | undefined => {
  if (!value.trim()) return undefined
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed < 0) {
    errors.push(`Row ${rowNumber}: ${field} must be a non-negative number.`)
    return undefined
  }
  return parsed
}

const parseBoolean = (
  value: string,
  rowNumber: number,
  errors: string[],
): boolean => {
  const normalized = value.trim().toLowerCase()
  if (!normalized) return false
  if (['true', '1', 'yes', 'y'].includes(normalized)) return true
  if (['false', '0', 'no', 'n'].includes(normalized)) return false
  errors.push(
    `Row ${rowNumber}: hazardousIndicator must be true/false, yes/no, or 1/0.`,
  )
  return false
}

const valueMap = (cells: string[]): Record<ProductImportCsvHeader, string> =>
  Object.fromEntries(
    PRODUCT_IMPORT_CSV_HEADERS.map((header, index) => [
      header,
      String(cells[index] ?? '').trim(),
    ]),
  ) as Record<ProductImportCsvHeader, string>

export function buildProductImportCsvTemplate(): string {
  return `${PRODUCT_IMPORT_CSV_HEADERS.join(',')}\n${PRODUCT_IMPORT_CSV_HEADERS.map(() => '').join(',')}\n`
}

export function parseProductImportCsv(text: string): ProductCsvParseResult {
  let records: string[][]
  try {
    records = parseCsvRecords(text)
  } catch (error) {
    return {
      rows: [],
      errors: [error instanceof Error ? error.message : 'Invalid CSV file.'],
    }
  }

  if (records.length === 0) {
    return { rows: [], errors: ['CSV file is empty.'] }
  }

  const headers = records[0].map((header) => header.trim())
  const expected = [...PRODUCT_IMPORT_CSV_HEADERS]
  if (
    headers.length !== expected.length ||
    headers.some((header, index) => header !== expected[index])
  ) {
    return {
      rows: [],
      errors: [
        `CSV headers must match this exact order: ${expected.join(', ')}`,
      ],
    }
  }

  const dataRecords = records.slice(1)
  if (dataRecords.length > MAX_IMPORT_ROWS) {
    return {
      rows: [],
      errors: [`CSV import is limited to ${MAX_IMPORT_ROWS} product rows.`],
    }
  }
  if (dataRecords.length === 0) {
    return { rows: [], errors: ['CSV file does not contain product rows.'] }
  }

  const rows: ProductCsvImportRow[] = []
  const errors: string[] = []
  const productIds = new Set<string>()

  dataRecords.forEach((cells, index) => {
    const rowNumber = index + 2
    if (cells.length > expected.length) {
      errors.push(`Row ${rowNumber}: too many columns.`)
      return
    }

    const values = valueMap(cells)
    const categoryReference = values.category
    if (!categoryReference) {
      errors.push(`Row ${rowNumber}: category is required.`)
    }

    const unitPrice = parseRequiredNumber(
      values.unitPrice,
      'unitPrice',
      rowNumber,
      errors,
    )
    const unitCost = parseRequiredNumber(
      values.unitCost,
      'unitCost',
      rowNumber,
      errors,
    )
    const taxRate = parseRequiredNumber(
      values.taxRate,
      'taxRate',
      rowNumber,
      errors,
    )
    const packSize = parseOptionalNumber(
      values.packSize,
      'packSize',
      rowNumber,
      errors,
    )
    if (packSize !== undefined && !Number.isInteger(packSize)) {
      errors.push(`Row ${rowNumber}: packSize must be a whole number.`)
    }

    const stockQuantity = parseOptionalNumber(
      values.stockQuantity,
      'stockQuantity',
      rowNumber,
      errors,
    )
    const rawMode = values.stockUpdateMode.toUpperCase()
    let stockUpdateMode: StockUpdateMode | null = null
    if (stockQuantity !== undefined) {
      if (rawMode !== 'SET' && rawMode !== 'ADD') {
        errors.push(
          `Row ${rowNumber}: stockUpdateMode must be SET or ADD when stockQuantity is provided.`,
        )
      } else {
        stockUpdateMode = rawMode
      }
    } else if (rawMode) {
      errors.push(
        `Row ${rowNumber}: stockQuantity is required when stockUpdateMode is provided.`,
      )
    }

    const productId = values.productId || values.productCode
    const normalizedProductId = productId.toUpperCase()
    if (normalizedProductId) {
      if (productIds.has(normalizedProductId)) {
        errors.push(`Row ${rowNumber}: duplicate productId ${productId}.`)
      }
      productIds.add(normalizedProductId)
    }

    const hazardousIndicator = parseBoolean(
      values.hazardousIndicator,
      rowNumber,
      errors,
    )
    const parsedProduct = createProductSchema.safeParse({
      productId,
      productCode: values.productCode,
      productName: values.productName,
      productClassCode: values.productClassCode,
      productTypeCode: values.productTypeCode,
      unitPrice,
      unitCost,
      currency: values.currency,
      taxRate,
      taxCode: values.taxCode,
      sku: values.sku || undefined,
      barcode: values.barcode || undefined,
      category: categoryReference,
      unitOfMeasure: values.unitOfMeasure || undefined,
      unitOfPackaging: values.unitOfPackaging || undefined,
      packSize:
        packSize !== undefined && Number.isInteger(packSize)
          ? packSize
          : undefined,
      commodityCode: values.commodityCode || undefined,
      hazardousIndicator,
      extHazardousIndicator: hazardousIndicator,
    })

    if (!parsedProduct.success) {
      const messages = parsedProduct.error.issues.map(
        (issue: { path: Array<string | number>; message: string }) =>
          `${issue.path.join('.') || 'product'}: ${issue.message}`,
      )
      errors.push(`Row ${rowNumber}: ${messages.join('; ')}`)
      return
    }

    rows.push({
      rowNumber,
      product: parsedProduct.data,
      categoryReference,
      stockQuantity: stockQuantity ?? null,
      stockUpdateMode,
    })
  })

  return { rows, errors }
}

export function validateProductImportCategories(
  rows: ProductCsvImportRow[],
  categories: ReadonlyMap<string, ProductImportCategory>,
  ambiguousReferences: ReadonlySet<string> = new Set(),
): string[] {
  const errors: string[] = []
  for (const row of rows) {
    const normalizedReference = row.categoryReference.trim().toUpperCase()
    if (ambiguousReferences.has(normalizedReference)) {
      errors.push(
        `Row ${row.rowNumber}: category ${row.categoryReference} matches multiple categories; use a unique category code.`,
      )
      continue
    }
    const category = categories.get(normalizedReference)
    if (!category) {
      errors.push(
        `Row ${row.rowNumber}: category ${row.categoryReference} was not found.`,
      )
      continue
    }
    if (
      row.stockQuantity !== null &&
      isFuelProduct({
        categoryCode: category.code,
        categoryName: category.name,
        productClassCode: row.product.productClassCode,
        externalProductClassCode: row.product.extProductClassCode,
        productTypeCode: row.product.productTypeCode,
        externalProductTypeCode: row.product.extProductTypeCode,
      })
    ) {
      errors.push(
        `Row ${row.rowNumber}: fuel products cannot include stockQuantity.`,
      )
    }
  }
  return errors
}
