import assert from 'node:assert/strict'
import test from 'node:test'
import { buildRecoveryProviderReview } from '@/src/modules/fiscalization/application/recoveryProviderReview'

const statusEvidence = {
  fiscalId: 'SECRET-ID', fiscalCode: 'SECRET-CODE',
  fiscalVerificationCode: 'SECRET-VERIFY',
  fiscalQrCodeData: 'SECRET-QR', revenueAuthorityReference: 'SECRET-AUTH',
}

test('identical field values still require authoritative mapping approval', () => {
  for (const countryCode of ['KE', 'TZ'] as const) {
    const review = buildRecoveryProviderReview({
      countryCode, statusEvidence, linkedEventResponse: { ...statusEvidence },
    })
    assert.equal(review.mappingReady, false)
    assert.equal(review.receiptCreationAuthorized, false)
    assert.equal(review.fields.every(item => item.status === 'matching'), true)
    assert.deepEqual(review.unresolved, [])
    assert.equal(JSON.stringify(review).includes('SECRET-'), false)
  }
})

test('missing, status-only, event-only, invalid and contradictory fields are distinguished', () => {
  const review = buildRecoveryProviderReview({
    countryCode: 'TZ',
    statusEvidence: { ...statusEvidence, fiscalCode: null, fiscalQrCodeData: null },
    linkedEventResponse: {
      fiscalId: 'DIFFERENT', fiscalCode: 'EVENT-CODE',
      fiscalVerificationCode: 123, revenueAuthorityReference: 'SECRET-AUTH',
    },
  })
  assert.deepEqual(review.fields.map(item => item.status), [
    'conflicting', 'event-only', 'invalid-event', 'missing', 'matching',
  ])
  assert.deepEqual(review.conflicts, ['fiscalId', 'fiscalVerificationCode'])
  assert.deepEqual(review.unresolved, [
    'fiscalId', 'fiscalCode', 'fiscalVerificationCode', 'fiscalQrCodeData',
  ])
})

test('unstructured event response never grants authority', () => {
  const review = buildRecoveryProviderReview({
    countryCode: 'KE', statusEvidence: null, linkedEventResponse: 'SUCCESS',
  })
  assert.equal(review.fields.every(item => item.status === 'missing'), true)
  assert.equal(review.receiptCreationAuthorized, false)
})
