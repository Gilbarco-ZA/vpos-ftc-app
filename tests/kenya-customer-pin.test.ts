import assert from 'node:assert/strict'
import test from 'node:test'
import { isValidKenyaPin } from '@/src/modules/customers/domain/kenyaPin'

test('Kenya PIN accepts A or P, 9 digits and a trailing letter', () => {
  assert.equal(isValidKenyaPin('A123456789Z'), true)
  assert.equal(isValidKenyaPin('P000000001A'), true)
  assert.equal(isValidKenyaPin(' a123456789z '), true)
})

test('Kenya PIN rejects incorrect prefixes, lengths and characters', () => {
  for (const value of ['B123456789Z', 'A12345678Z', 'A1234567890',
    'P123456789', 'P123456789ZZ', 'A12345X789Z', '']) {
    assert.equal(isValidKenyaPin(value), false, value)
  }
})
