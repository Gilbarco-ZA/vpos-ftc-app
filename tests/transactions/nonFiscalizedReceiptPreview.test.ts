import assert from 'node:assert/strict'
import test from 'node:test'

import { normalizeReceipt } from '../../src/shared/receipts/normalizeReceipt'

const transaction = {
  id: '8dd2c5ca-25cb-4a76-b1ee-b31a2f159862',
  status: 'OPEN',
  total_amount: 250,
  volume: 10,
  fuel_type: 'Diesel',
  transaction_date_time: '2026-07-16T06:00:00.000Z',
}

test('OPEN transaction only renders when non-fiscalized preview is requested', () => {
  assert.equal(
    normalizeReceipt({
      transaction,
      stationName: 'Test Station',
      station: { country: 'KE' },
      raw: null,
    }),
    null,
  )

  const preview = normalizeReceipt({
    transaction,
    stationName: 'Test Station',
    station: { country: 'KE' },
    raw: null,
    allowUnfiscalizedPreview: true,
  })

  assert.ok(preview)
  assert.equal(preview.header.title, 'RECEIPT PREVIEW')
  assert.equal(preview.items.length, 1)
  assert.equal(preview.totals.amount, 250)
})
