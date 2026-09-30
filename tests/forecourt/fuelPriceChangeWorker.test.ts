import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import type { FuelPriceChangeDto } from '@/src/shared/proxy/client'
import {
  buildDomsPriceChangePayload,
  resolveDomsGradeIdFromRows,
} from '@/src/modules/forecourt/infrastructure/fuelPriceChangeWorker'

const change = (
  overrides: Partial<FuelPriceChangeDto> = {},
): FuelPriceChangeDto => ({
  id: 101,
  fiscalDeviceId: 1,
  productId: 9994,
  productCode: 'G3',
  productName: 'Petrol R',
  previousPrice: 21.4,
  newPrice: 25.4,
  effectiveAt: '2026-09-30T12:00:00Z',
  ...overrides,
})

describe('fuel price change worker mapping', () => {
  it('resolves external product code to one DOMS grade across multiple pumps', () => {
    const rows = [
      {
        ext_product_code: null,
        product_code: 'G3',
        ext_product_id: null,
        product_id: '3',
        doms_grade_id: '02',
      },
      {
        ext_product_code: null,
        product_code: 'G3',
        ext_product_id: null,
        product_id: '3',
        doms_grade_id: '02',
      },
    ] as any

    assert.equal(resolveDomsGradeIdFromRows(rows, change()), '02')
  })

  it('uses external product id only when product code is absent', () => {
    const rows = [
      {
        ext_product_code: null,
        product_code: 'G3',
        ext_product_id: '9994',
        product_id: '3',
        doms_grade_id: '03',
      },
    ] as any

    assert.equal(
      resolveDomsGradeIdFromRows(
        rows,
        change({ productCode: null, productId: 9994 }),
      ),
      '03',
    )
  })

  it('rejects ambiguous product-to-grade mappings', () => {
    const rows = [
      {
        ext_product_code: null,
        product_code: 'G3',
        ext_product_id: null,
        product_id: '3',
        doms_grade_id: '02',
      },
      {
        ext_product_code: null,
        product_code: 'G3',
        ext_product_id: null,
        product_id: '3',
        doms_grade_id: '03',
      },
    ] as any

    assert.throws(
      () => resolveDomsGradeIdFromRows(rows, change()),
      /multiple DOMS grades/,
    )
  })
})

describe('fuel price change DOMS payload', () => {
  it('applies an already-effective change immediately', () => {
    assert.deepEqual(
      buildDomsPriceChangePayload(
        change({ effectiveAt: '2026-09-30T12:00:00Z' }),
        '02',
        'Africa/Johannesburg',
        new Date('2026-09-30T13:00:00Z'),
      ),
      {
        entries: [{ gradeId: '02', price: 25.4 }],
        requestedBy: 'vpos-cloud-fuel-price-change',
        applyNow: true,
      },
    )
  })

  it('schedules a future-effective change on DOMS', () => {
    assert.deepEqual(
      buildDomsPriceChangePayload(
        change({ effectiveAt: '2026-10-01T00:01:00' }),
        '02',
        'Africa/Johannesburg',
        new Date('2026-09-30T13:00:00Z'),
      ),
      {
        entries: [{ gradeId: '02', price: 25.4 }],
        requestedBy: 'vpos-cloud-fuel-price-change',
        effectiveAt: '2026-10-01T00:01:00',
      },
    )
  })
})
