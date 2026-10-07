import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
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

describe('fuel price polling support workflow', () => {
  it('persists poll health and exposes a manual proxy check on forecourt pricing', () => {
    const worker = readFileSync(
      'src/modules/forecourt/infrastructure/fuelPriceChangeWorker.ts',
      'utf8',
    )
    const route = readFileSync(
      'app/api/setup/forecourt/pricing/fuel-price-polling/route.ts',
      'utf8',
    )
    const page = readFileSync(
      'app/(dashboard)/setup/forecourt/pricing/page.tsx',
      'utf8',
    )
    const client = readFileSync(
      'app/(dashboard)/setup/forecourt/pricing/client.tsx',
      'utf8',
    )

    assert.match(worker, /forecourt\.fuelPrice\.pollStatus/)
    assert.match(worker, /lastAttemptAt/)
    assert.match(worker, /lastSuccessAt/)
    assert.match(worker, /lastFailureAt/)
    assert.match(worker, /fetched: summary\.fetched/)
    assert.match(worker, /applied: summary\.applied/)
    assert.match(worker, /skipped: summary\.skipped/)
    assert.match(worker, /lastError: message/)

    const applicationPolling = readFileSync(
      'src/modules/forecourt/application/fuelPricePolling.ts',
      'utf8',
    )

    assert.match(route, /export const POST = defineMutationRoute/)
    assert.match(route, /checkFuelPricesNow\(user\.stationId\)/)
    assert.match(route, /getFuelPricePollingOverview\(user\.stationId\)/)
    assert.doesNotMatch(
      route,
      /@\/src\/modules\/forecourt\/infrastructure\//,
    )
    assert.match(applicationPolling, /pollFuelPriceChangesOnce\(stationId\)/)
    assert.match(applicationPolling, /getFuelPricePollStatus\(stationId\)/)
    assert.match(
      route,
      /roles: \['administrator', 'manager', 'field_engineer'\]/,
    )
    assert.match(
      page,
      /requireAuth\(\['administrator', 'manager', 'field_engineer'\]\)/,
    )

    assert.match(client, /Check cloud prices now/)
    assert.match(client, /Last poll attempt/)
    assert.match(client, /Last successful poll/)
    assert.match(client, /fuelPricePollStatus\.fetched/)
    assert.match(client, /fuelPricePollStatus\.applied/)
    assert.match(client, /fuelPricePollStatus\.skipped/)
    assert.match(client, /Last fuel price poll error/)
    assert.match(
      client,
      /method: 'POST'[\s\S]*x-csrf-token[\s\S]*csrf_token: csrfToken/,
    )
  })
})

it('fuel price worker falls back from cloud ext product code to local DOMS product mapping', () => {
  const worker = readFileSync(
    'src/modules/forecourt/infrastructure/fuelPriceChangeWorker.ts',
    'utf8',
  )

  assert.match(worker, /resolveLocalProductIdentity/)
  assert.match(worker, /ext_product_code/)
  assert.match(worker, /ext_product_id/)
  assert.match(worker, /product_record_id/)
  assert.match(worker, /row\.product_record_id/)
  assert.match(worker, /productCode: localProduct\.product_code/)
  assert.match(worker, /Check tank\/nozzle product linkage and doms_grade_id/)
})

it('uses Tanzania local product id as the validated DOMS grade fallback', () => {
  const worker = readFileSync(
    'src/modules/forecourt/infrastructure/fuelPriceChangeWorker.ts',
    'utf8',
  )

  assert.match(worker, /isTanzaniaStation/)
  assert.match(worker, /\^\\d\+\$/)
  assert.match(worker, /return localProductId/)
  assert.match(worker, /active DOMS price bank/)
  assert.match(worker, /ext_unit_price = \$3/)
})

it('dispatches DOMS commands through JPL forecourt access instead of the POS backend gate', () => {
  const doms = readFileSync(
    'src/modules/pos/application/legacy/doms.ts',
    'utf8',
  )

  assert.match(doms, /jplSendPosCommand/)
  assert.match(doms, /accessMode: 'forecourt'/)
  assert.doesNotMatch(doms, /posControlClient/)
})

