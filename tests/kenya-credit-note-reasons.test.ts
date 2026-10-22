import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { KENYA_CREDIT_NOTE_REASONS, isKenyaCreditNoteReasonCode } from '../src/modules/transactions/domain/kenyaCreditNoteReasons'

test('Kenya reason dropdown contains every official code 01 to 13', () => {
  assert.deepEqual(KENYA_CREDIT_NOTE_REASONS.map((r) => r.code),
    Array.from({ length: 13 }, (_, i) => String(i + 1).padStart(2, '0')))
  for (const reason of KENYA_CREDIT_NOTE_REASONS) {
    assert.equal(isKenyaCreditNoteReasonCode(reason.code), true)
    assert.ok(reason.description)
  }
  for (const bad of ['', '1', '00', '14', 'RETURN', 'Refund']) {
    assert.equal(isKenyaCreditNoteReasonCode(bad), false)
  }
})

test('Both credit-note entry screens use reason dropdown rather than free-text', () => {
  for (const path of [
    'components/transactions/FiscalizedTransactionsPageClient.tsx',
    'components/transactions/FiscalizedTransactionsManagerClient.tsx',
  ]) {
    const text = readFileSync(path, 'utf8')
    assert.match(text, /KENYA_CREDIT_NOTE_REASONS\.map/)
    assert.match(text, /value=\{creditReasonCode\}/)
    assert.match(text, /!creditReasonCode/)
  }
})
