import assert from 'node:assert/strict'
import test from 'node:test'
import { getCountryReceiptPolicy } from '@/src/modules/fiscalization/application/receiptPolicyRegistry'
import { getCountryStatusNormalizer } from '@/src/modules/fiscalization/application/statusPolicyRegistry'
import { buildReceiptLines as kenyaTemplate } from '@/src/shared/fiscalization/receipt/templates/KE'
import { buildReceiptLines as tanzaniaTemplate } from '@/src/shared/fiscalization/receipt/templates/TZ'

test('receipt policies delegate to existing templates without transformation', () => {
  assert.equal(getCountryReceiptPolicy('KE').render, kenyaTemplate)
  assert.equal(getCountryReceiptPolicy('TZA').render, tanzaniaTemplate)
  assert.throws(() => getCountryReceiptPolicy('XX'), /Unsupported/)
})

test('uncertain status does not grant retry permission', () => {
  const normalize = getCountryStatusNormalizer('TZ')
  assert.deepEqual(normalize({ error: false, status: 'fiscalizing', documentId: 'TX1' }), {
    state: 'processing', documentId: 'TX1', sourceStatus: 'FISCALIZING',
    reason: 'Fiscalization outcome remains unresolved', safeToResubmit: false,
  })
  assert.equal(normalize({ error: false, status: 'unrecognized' }).state, 'unknown')
  assert.equal(normalize({ error: true, status: 'rejected' }).state, 'failed')
  assert.equal(normalize({ error: true, details: { isFiscalized: true } }).state, 'fiscalized')
  assert.throws(() => getCountryStatusNormalizer('XX'), /Unsupported/)
})
