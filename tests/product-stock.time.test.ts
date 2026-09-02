import assert from 'node:assert/strict'
import test from 'node:test'

import {
  emptyStockMovementForm,
  isFutureLocalDateTime,
  localDateTimeInputValue,
  localDateTimeToIso,
} from '@/components/stock/stock.helpers'

test('stock movement form defaults to the current local minute', () => {
  const before = new Date()
  const form = emptyStockMovementForm()
  const after = new Date()
  const effectiveAt = localDateTimeToIso(form.effectiveAtLocal)

  assert.ok(effectiveAt)
  const timestamp = new Date(effectiveAt).getTime()
  assert.ok(timestamp <= after.getTime())
  assert.ok(timestamp >= before.getTime() - 60_000)
})

test('local date-time input preserves the selected local minute', () => {
  const selected = new Date(2026, 7, 4, 8, 32, 45, 500)
  const value = localDateTimeInputValue(selected)

  assert.equal(value, '2026-08-04T08:32')
  assert.equal(
    localDateTimeToIso(value),
    new Date(2026, 7, 4, 8, 32, 0, 0).toISOString(),
  )
})

test('same-minute stock capture is not treated as future-dated', () => {
  const now = new Date(2026, 7, 4, 8, 32, 45, 0)
  const currentMinute = localDateTimeInputValue(now)

  assert.equal(isFutureLocalDateTime(currentMinute, now), false)
})

test('genuinely future stock capture is still rejected', () => {
  const now = new Date(2026, 7, 4, 8, 32, 0, 0)
  const later = new Date(now.getTime() + 6 * 60 * 1000)

  assert.equal(
    isFutureLocalDateTime(localDateTimeInputValue(later), now),
    true,
  )
})
