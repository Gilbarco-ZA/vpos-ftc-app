import test from 'node:test'
import assert from 'node:assert/strict'

import { mapTransactionToProxyInvoice } from '../../src/modules/transactions/infrastructure/fiscalization/transaction-proxy.mapper'

const TAX_RATE = 0.16
function round2(value: number): number {
  return Number(value.toFixed(2))
}

function buildInvoice(totalAmount: number, quantity: number) {
  return mapTransactionToProxyInvoice({
    transaction: {
      id: `txn-${totalAmount}-${quantity}`,
      total_amount: totalAmount,
      quantity,
      created_at: '2026-03-18T08:00:00.000Z',
      fuel_type: 'Test Product',
    },
    customer: null,
    station: { country: 'KE' },
    vatRate: TAX_RATE,
    taxType: 'B',
    taxRate: TAX_RATE,
    enrichment: {
      description: 'Test Product',
      unitOfMeasure: 'EA',
      taxCode: 'B',
      taxRate: TAX_RATE,
    },
  })
}

function getLine(invoice: ReturnType<typeof buildInvoice>) {
  const line = invoice.lines?.[0]
  assert.ok(line, 'expected mapped invoice line')
  assert.ok(line.product, 'expected mapped invoice product')
  assert.ok(line.taxes?.[0], 'expected mapped invoice tax line')
  return {
    product: line.product!,
    tax: line.taxes![0]!,
    totals: invoice.totals!,
  }
}

const priceCases = [
  0.01,
  0.05,
  0.1,
  0.29,
  0.99,
  1,
  1.01,
  1.16,
  1.99,
  2.5,
  4.99,
  5,
  9.99,
  10,
  12.34,
  19.99,
  25,
  49.99,
  99.95,
  123.45,
  999.99,
]

const quantityCases = [1, 2, 3, 4, 5, 7, 10, 11]

const scenarios = quantityCases.flatMap((quantity) =>
  priceCases.map((gross) => ({ gross, quantity })),
)

test('proxy mapper keeps payload totals internally consistent at 16% tax', () => {
  const inconsistencies: string[] = []

  for (const { gross, quantity } of scenarios) {
    const invoice = buildInvoice(gross, quantity)
    const { product, tax, totals } = getLine(invoice)

    const sentGross = round2(product.priceExtension ?? 0)
    const sentNet = round2(totals.net ?? 0)
    const sentTax = round2(totals.tax ?? 0)
    const reconstructedGross = round2(sentNet + sentTax)
    const taxBase = round2(tax.base ?? 0)
    const taxAmount = round2(tax.amount ?? 0)

    if (
      sentGross !== round2(gross) ||
      reconstructedGross !== round2(gross) ||
      sentNet !== taxBase ||
      sentTax !== taxAmount ||
      round2(totals.amount ?? 0) !== round2(gross)
    ) {
      inconsistencies.push(
        `gross=${gross.toFixed(2)} qty=${quantity} sentGross=${sentGross.toFixed(2)} net=${sentNet.toFixed(2)} tax=${sentTax.toFixed(2)} reconstructed=${reconstructedGross.toFixed(2)} taxBase=${taxBase.toFixed(2)} taxAmount=${taxAmount.toFixed(2)}`,
      )
    }

    console.log(`gross=${gross.toFixed(2)} qty=${quantity} sentGross=${sentGross.toFixed(2)} net=${sentNet.toFixed(2)} tax=${sentTax.toFixed(2)} reconstructed=${reconstructedGross.toFixed(2)} taxBase=${taxBase.toFixed(2)} taxAmount=${taxAmount.toFixed(2)}`)
  }

  assert.deepEqual(
    inconsistencies,
    [],
    `mapper totals must stay self-consistent:\n${inconsistencies.join('\n')}`,
  )
})

test('proxy mapper stays close to authority-side reconstruction across prices and quantities', () => {
  const driftCases: string[] = []
  let worstCase: { gross: number; quantity: number; drift: number; detail: string } | null = null

  for (const { gross, quantity } of scenarios) {
    const invoice = buildInvoice(gross, quantity)
    const { product, tax, totals } = getLine(invoice)

    const unitNet = round2(product.unitPrice ?? 0)
    const authorityNet = round2(unitNet * product.quantity)
    const authorityTax = round2(authorityNet * TAX_RATE)
    const authorityGross = round2(authorityNet + authorityTax)
    const expectedGross = round2(gross)
    const drift = round2(Math.abs(authorityGross - expectedGross))

    const detail = [
      `gross=${expectedGross.toFixed(2)}`,
      `qty=${product.quantity}`,
      `unitNet=${unitNet.toFixed(2)}`,
      `lineNet=${round2(totals.net ?? 0).toFixed(2)}`,
      `lineTax=${round2(tax.amount ?? 0).toFixed(2)}`,
      `authorityNet=${authorityNet.toFixed(2)}`,
      `authorityTax=${authorityTax.toFixed(2)}`,
      `authorityGross=${authorityGross.toFixed(2)}`,
      `drift=${drift.toFixed(2)}`,
    ].join(' ')

    if (!worstCase || drift > worstCase.drift) {
      worstCase = { gross, quantity, drift, detail }
    }

    if (drift > 0.01) {
      driftCases.push(detail)
    }
  }

  assert.deepEqual(
    driftCases,
    [],
    [
      'authority-side reconstruction drift exceeded 0.01 for one or more scenarios.',
      'This usually means unitPrice rounding is no longer aligned with line-level net/tax calculation.',
      worstCase ? `Worst case: ${worstCase.detail}` : 'Worst case: none',
      ...driftCases.slice(0, 25),
    ].join('\n'),
  )
})

test('sample edge cases remain visible and easy to tune against', async (t) => {
  const edgeCases = [
    { gross: 10.0, quantity: 3 },
    { gross: 12.34, quantity: 7 },
    { gross: 99.95, quantity: 11 },
  ]

  for (const edgeCase of edgeCases) {
    await t.test(`gross=${edgeCase.gross.toFixed(2)} qty=${edgeCase.quantity}`, () => {
      const invoice = buildInvoice(edgeCase.gross, edgeCase.quantity)
      const { product, tax, totals } = getLine(invoice)

      const authorityNet = round2((product.unitPrice ?? 0) * product.quantity)
      const authorityTax = round2(authorityNet * TAX_RATE)
      const authorityGross = round2(authorityNet + authorityTax)

      assert.equal(round2(totals.amount ?? 0), round2(edgeCase.gross))
      assert.equal(round2((totals.net ?? 0) + (totals.tax ?? 0)), round2(edgeCase.gross))
      assert.equal(round2(tax.rate ?? 0), 16)
      assert.ok(
        Math.abs(authorityGross - round2(edgeCase.gross)) <= 0.01,
        `authority reconstruction drifted by ${round2(Math.abs(authorityGross - edgeCase.gross)).toFixed(2)} for gross=${edgeCase.gross.toFixed(2)} qty=${edgeCase.quantity}; unitNet=${round2(product.unitPrice ?? 0).toFixed(2)} authorityGross=${authorityGross.toFixed(2)}`,
      )
    })
  }
})
