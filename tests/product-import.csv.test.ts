import assert from 'node:assert/strict'
import test from 'node:test'

import type {
  ProductCreateInput,
} from '@/src/modules/products/infrastructure/validators/product.schemas'

import {
  buildProductImportCsvTemplate,
  parseProductImportCsv,
  PRODUCT_IMPORT_CSV_HEADERS,
  validateProductImportCategories,
} from '@/src/modules/products/application/productCsvImport'

const validProduct: ProductCreateInput = {
  productId: 'ITEM-1',
  productCode: 'ITEM-1',
  productName: 'General item',
  productClassCode: 'GOODS',
  productTypeCode: 'GOODS',
  unitPrice: 10,
  unitCost: 5,
  currency: 'ZAR',
  taxRate: 15,
  taxCode: 'VAT',
  hazardousIndicator: false,
  extHazardousIndicator: false,
}

test('product import template exposes the required fields in exact order', () => {
  const [header] = buildProductImportCsvTemplate().trimEnd().split('\n')
  assert.equal(header, PRODUCT_IMPORT_CSV_HEADERS.join(','))
})

test('CSV import parses quoted fields and explicit SET stock updates', () => {
  const csv = [
    PRODUCT_IMPORT_CSV_HEADERS.join(','),
    [
      'OIL-1',
      'OIL-1',
      '"Engine Oil, 5W30"',
      'LUBE',
      'GOODS',
      '150',
      '100',
      'ZAR',
      '15',
      'VAT',
      'Lubricants',
      'SKU-1',
      '',
      'EACH',
      '00',
      '1',
      '',
      'false',
      '25',
      'SET',
    ].join(','),
  ].join('\n')

  const parsed = parseProductImportCsv(csv)
  assert.deepEqual(parsed.errors, [])
  assert.equal(parsed.rows.length, 1)
  assert.equal(parsed.rows[0]?.product.productName, 'Engine Oil, 5W30')
  assert.equal(parsed.rows[0]?.product.hazardousIndicator, false)
  assert.equal(parsed.rows[0]?.product.extHazardousIndicator, false)
  assert.equal(parsed.rows[0]?.stockQuantity, 25)
  assert.equal(parsed.rows[0]?.stockUpdateMode, 'SET')
})

test('stock quantity requires an explicit update mode', () => {
  const values = Object.fromEntries(
    PRODUCT_IMPORT_CSV_HEADERS.map((header) => [header, '']),
  ) as Record<(typeof PRODUCT_IMPORT_CSV_HEADERS)[number], string>
  Object.assign(values, {
    productCode: 'FILTER-1',
    productName: 'Oil Filter',
    productClassCode: 'PART',
    productTypeCode: 'GOODS',
    unitPrice: '80',
    unitCost: '50',
    currency: 'ZAR',
    taxRate: '15',
    taxCode: 'VAT',
    category: 'Parts',
    stockQuantity: '10',
  })
  const csv = `${PRODUCT_IMPORT_CSV_HEADERS.join(',')}\n${PRODUCT_IMPORT_CSV_HEADERS.map((header) => values[header]).join(',')}`

  const parsed = parseProductImportCsv(csv)
  assert.equal(parsed.rows.length, 1)
  assert.ok(
    parsed.errors.some((error) =>
      error.includes('stockUpdateMode must be SET or ADD'),
    ),
  )
})

test('CSV import rejects unexpected header order', () => {
  const headers = [...PRODUCT_IMPORT_CSV_HEADERS]
  ;[headers[0], headers[1]] = [headers[1], headers[0]]
  const parsed = parseProductImportCsv(headers.join(','))
  assert.ok(parsed.errors[0]?.includes('exact order'))
})

test('fuel-category products cannot import product stock', () => {
  const values = Object.fromEntries(
    PRODUCT_IMPORT_CSV_HEADERS.map((header) => [header, '']),
  ) as Record<(typeof PRODUCT_IMPORT_CSV_HEADERS)[number], string>
  Object.assign(values, {
    productCode: 'DIESEL-50',
    productName: 'Diesel 50ppm',
    productClassCode: 'FUEL',
    productTypeCode: 'GOODS',
    unitPrice: '25',
    unitCost: '20',
    currency: 'ZAR',
    taxRate: '15',
    taxCode: 'VAT',
    category: 'Fuel',
    stockQuantity: '1000',
    stockUpdateMode: 'SET',
  })
  const parsed = parseProductImportCsv(
    `${PRODUCT_IMPORT_CSV_HEADERS.join(',')}\n${PRODUCT_IMPORT_CSV_HEADERS.map((header) => values[header]).join(',')}`,
  )
  const errors = validateProductImportCategories(
    parsed.rows,
    new Map([
      ['FUEL', { id: 'fuel-category', code: 'FUEL', name: 'Fuel' }],
    ]),
  )

  assert.ok(errors.some((error) => error.includes('cannot include stockQuantity')))
})

test('fuel class and type codes cannot import product stock', () => {
  const result = validateProductImportCategories(
    [
      {
        rowNumber: 2,
        product: {
          ...validProduct,
          productClassCode: 'FUEL',
          productTypeCode: 'PETROL',
        },
        categoryReference: 'GENERAL',
        stockQuantity: 100,
        stockUpdateMode: 'SET',
      },
    ],
    new Map([
      [
        'GENERAL',
        { id: 'general-category', code: 'GENERAL', name: 'General' },
      ],
    ]),
  )

  assert.deepEqual(result, [
    'Row 2: fuel products cannot include stockQuantity.',
  ])
})

test('ambiguous category references are rejected instead of guessed', () => {
  const values = Object.fromEntries(
    PRODUCT_IMPORT_CSV_HEADERS.map((header) => [header, '']),
  ) as Record<(typeof PRODUCT_IMPORT_CSV_HEADERS)[number], string>
  Object.assign(values, {
    productCode: 'ITEM-1',
    productName: 'Imported item',
    productClassCode: 'GOODS',
    productTypeCode: 'GOODS',
    unitPrice: '10',
    unitCost: '5',
    currency: 'ZAR',
    taxRate: '15',
    taxCode: 'VAT',
    category: 'General',
  })
  const parsed = parseProductImportCsv(
    `${PRODUCT_IMPORT_CSV_HEADERS.join(',')}\n${PRODUCT_IMPORT_CSV_HEADERS.map((header) => values[header]).join(',')}`,
  )
  const errors = validateProductImportCategories(
    parsed.rows,
    new Map(),
    new Set(['GENERAL']),
  )

  assert.ok(errors.some((error) => error.includes('matches multiple categories')))
})
