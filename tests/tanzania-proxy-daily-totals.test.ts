import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildTanzaniaDailyTotalRequest,
  buildTanzaniaDailyTotalTank,
} from '@/src/modules/tanzania-fiscal/infrastructure/proxyDailyTotals'

test('Tanzania daily totals aggregate payments, tax buckets, and fuel sales', () => {
  const payload = buildTanzaniaDailyTotalRequest({
    businessDate: '2026-08-03',
    reportTime: '23:59:59',
    grossTotal: 236,
    defaultVatRatePercent: 18,
    transactions: [
      {
        id: 'tx-1',
        total_amount: 118,
        volume: 2,
        fuel_type: 'Petrol 95',
        grade_name: 'ULP 95',
        payment_type: 'cash',
        tank_product_type: 'PMS',
        tank_product_name: 'Petrol',
        fallback_tax_code: 'A',
        fallback_tax_rate: 18,
      },
      {
        id: 'tx-2',
        total_amount: 118,
        volume: 2,
        fuel_type: 'Diesel',
        grade_name: 'AGO',
        payment_type: 'card',
        tank_product_type: 'AGO',
        tank_product_name: 'Diesel',
        fallback_tax_code: 'A',
        fallback_tax_rate: 18,
      },
    ],
    lines: [
      {
        transaction_id: 'tx-1',
        quantity: 2,
        unit_price: 59,
        tax_code: 'A',
        tax_rate: 18,
        product_name: 'Petrol 95',
        product_type_code: 'PMS',
        category_name: 'Fuel',
      },
      {
        transaction_id: 'tx-2',
        quantity: 2,
        unit_price: 59,
        tax_code: 'A',
        tax_rate: 18,
        product_name: 'Diesel',
        product_type_code: 'AGO',
        category_name: 'Fuel',
      },
    ],
  })

  assert.equal(payload.reportDate, '2026-08-03')
  assert.equal(payload.zNumber, '20260803')
  assert.equal(payload.dailyTotalAmount, 236)
  assert.equal(payload.grossTotal, 236)
  assert.equal(payload.netA, 200)
  assert.equal(payload.taxA, 36)
  assert.equal(payload.vatRateA, 18)
  assert.equal(payload.pmtCash, 118)
  assert.equal(payload.pmtCard, 118)
  assert.equal(payload.ticketsFiscalCount, 2)
  assert.equal(payload.totalStnVolume, 4)
  assert.equal(payload.totalPetrol, 2)
  assert.equal(payload.totalDiesel, 2)
  assert.equal(payload.trnPetrol, 1)
  assert.equal(payload.trnDiesel, 1)
  assert.equal(payload.unitPricePetrol, 59)
  assert.equal(payload.petrolTotalAmount, 118)
  assert.equal(payload.tanks, undefined)
})

test('Tanzania daily totals reject TaxCode Z because vpos-proxy does not support it', () => {
  assert.throws(
    () =>
      buildTanzaniaDailyTotalRequest({
        businessDate: '2026-08-03',
        reportTime: '23:59:59',
        grossTotal: 10,
        defaultVatRatePercent: 18,
        transactions: [
          {
            id: 'tx-z',
            total_amount: 10,
            volume: 0,
            fuel_type: null,
            grade_name: null,
            payment_type: 'cash',
            tank_product_type: null,
            tank_product_name: null,
            fallback_tax_code: 'Z',
            fallback_tax_rate: 0,
          },
        ],
        lines: [],
      }),
    /not supported by vpos-proxy/,
  )
})

test('Tanzania daily totals reject multiple rates in one authority bucket', () => {
  assert.throws(
    () =>
      buildTanzaniaDailyTotalRequest({
        businessDate: '2026-08-03',
        reportTime: '23:59:59',
        grossTotal: 200,
        defaultVatRatePercent: 18,
        transactions: [
          {
            id: 'tx-rates',
            total_amount: 200,
            volume: 0,
            fuel_type: null,
            grade_name: null,
            payment_type: 'cash',
            tank_product_type: null,
            tank_product_name: null,
            fallback_tax_code: 'A',
            fallback_tax_rate: 18,
          },
        ],
        lines: [
          {
            transaction_id: 'tx-rates',
            quantity: 1,
            unit_price: 118,
            tax_code: 'A',
            tax_rate: 18,
            product_name: null,
            product_type_code: null,
            category_name: null,
          },
          {
            transaction_id: 'tx-rates',
            quantity: 1,
            unit_price: 82,
            tax_code: 'A',
            tax_rate: 15,
            product_name: null,
            product_type_code: null,
            category_name: null,
          },
        ],
      }),
    /multiple VAT rates/,
  )
})

test('Tanzania fuel totals exclude non-fuel lines in mixed transactions', () => {
  const payload = buildTanzaniaDailyTotalRequest({
    businessDate: '2026-08-03',
    reportTime: '23:59:59',
    grossTotal: 168,
    defaultVatRatePercent: 18,
    transactions: [
      {
        id: 'tx-mixed',
        total_amount: 168,
        volume: 2,
        fuel_type: 'Petrol 95',
        grade_name: 'ULP 95',
        payment_type: 'cash',
        tank_product_type: 'PMS',
        tank_product_name: 'Petrol',
        fallback_tax_code: 'A',
        fallback_tax_rate: 18,
      },
    ],
    lines: [
      {
        transaction_id: 'tx-mixed',
        quantity: 2,
        unit_price: 59,
        tax_code: 'A',
        tax_rate: 18,
        product_name: 'Regular',
        product_type_code: null,
        category_name: 'Fuel',
      },
      {
        transaction_id: 'tx-mixed',
        quantity: 1,
        unit_price: 50,
        tax_code: 'A',
        tax_rate: 18,
        product_name: 'Engine Oil',
        product_type_code: 'SHOP',
        category_name: 'Lubricants',
      },
    ],
  })

  assert.equal(payload.dailyTotalAmount, 168)
  assert.equal(payload.totalStnVolume, 2)
  assert.equal(payload.totalPetrol, 2)
  assert.equal(payload.petrolTotalAmount, 118)
  assert.equal(payload.unitPricePetrol, 59)
  assert.equal(payload.trnPetrol, 1)
})


test('Tanzania daily totals retain every physical tank separately using the current ATG reading', () => {
  const tank1 = buildTanzaniaDailyTotalTank({
    tankId: '1',
    tankProdName: 'Diesel',
    saleNumber: 2,
    saleVolume: 70,
    deliveryVolume: 1000,
    measuredEndVolume: 14940,
  })
  const tank2 = buildTanzaniaDailyTotalTank({
    tankId: '2',
    tankProdName: 'Diesel',
    saleNumber: 1,
    saleVolume: 30,
    deliveryVolume: 0,
    measuredEndVolume: 19820,
  })

  assert.deepEqual(tank1, {
    tankId: '1',
    tankProdName: 'Diesel',
    saleNumber: 2,
    startVolume: 14010,
    atgDeliveryVolume: 1000,
    saleVolume: 70,
    measuredEndVolume: 14940,
    calculatedEndVolume: 14940,
    volumeDifference: 0,
  })

  const payload = buildTanzaniaDailyTotalRequest({
    businessDate: '2026-08-27',
    reportTime: '23:59:59',
    transactions: [],
    lines: [],
    grossTotal: 0,
    defaultVatRatePercent: 18,
    tanks: [tank1, tank2],
  })
  assert.equal(payload.tanks?.length, 2)
  assert.equal(payload.tanks?.[0]?.tankId, '1')
  assert.equal(payload.tanks?.[1]?.tankId, '2')
  assert.equal(payload.tanks?.[0]?.measuredEndVolume, 14940)
  assert.equal(payload.tanks?.[1]?.measuredEndVolume, 19820)
})
