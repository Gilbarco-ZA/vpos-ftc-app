import assert from 'node:assert/strict'
import test from 'node:test'
import { inspectRecoveryProviderFields } from '@/src/modules/fiscalization/application/recoveryProviderFieldInventory'

const statusEvidence = {
  fiscalId: 'F1', fiscalCode: 'C1', fiscalVerificationCode: 'V1',
  fiscalQrCodeData: 'QR1', revenueAuthorityReference: 'AUTH1',
}

test('KE and TZ never automatically approve status fields as receipt references', () => {
  for (const countryCode of ['KE', 'TZ'] as const) {
    const value = inspectRecoveryProviderFields({
      countryCode, statusEvidence, linkedEventResponse: { ...statusEvidence },
    })
    assert.equal(value.referenceMappingApproved, false)
    assert.deepEqual(value.fields, statusEvidence)
    assert.deepEqual(value.conflicts, [])
    assert.deepEqual(value.missingFields, [])
  }
})

test('missing status evidence stays explicitly missing and unapproved', () => {
  const value = inspectRecoveryProviderFields({
    countryCode: 'TZ', statusEvidence: null, linkedEventResponse: {},
  })
  assert.equal(value.missingFields.length, 5)
  assert.equal(value.referenceMappingApproved, false)
})

test('contradictory and invalid same-name event fields are detectable without alias guessing', () => {
  const value = inspectRecoveryProviderFields({
    countryCode: 'KE', statusEvidence,
    linkedEventResponse: { fiscalId: 'OTHER', fiscalCode: 12, fiscalQrCodeData: 'QR1' },
  })
  assert.deepEqual(value.conflicts, ['fiscalId', 'fiscalCode'])
  assert.equal(value.referenceMappingApproved, false)
})

test('nested unverified fields cannot be promoted to a reference', () => {
  const value = inspectRecoveryProviderFields({
    countryCode: 'TZ', statusEvidence,
    linkedEventResponse: { receipt: { fiscalId: 'F1' } },
  })
  assert.deepEqual(value.conflicts, [])
  assert.equal(value.referenceMappingApproved, false)
})
