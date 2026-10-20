import assert from 'node:assert/strict'
import test from 'node:test'
import { parseInvoiceStatusCollection } from '@/src/modules/fiscalization/application/swaggerStatusContract'
import { assessFiscalStatusRecovery } from '@/src/modules/fiscalization/application/statusRecoveryService'

test('retains named fiscal values for the exact correlated invoice', async () => {
  const port = { async lookup() {
    return parseInvoiceStatusCollection('D1', {
      error: false,
      invoices: [
        { documentId: 'OTHER', status: 'FISCALIZED', error: false, fiscalId: 'WRONG' },
        { documentId: 'D1', status: 'FISCALIZED', error: false,
          fiscalId: ' F1 ', fiscalCode: ' C1 ',
          fiscalVerificationCode: 'V1', fiscalQrCodeData: 'QR1',
          revenueAuthorityReference: 'RA1' },
      ],
    })
  } }
  const result = await assessFiscalStatusRecovery(port, {
    country: 'TZ', stationId: 'S1', documentId: 'D1',
  })
  assert.equal(result.outcome, 'confirmed')
  assert.deepEqual(result.fiscalEvidence, {
    fiscalId: 'F1', fiscalCode: 'C1',
    fiscalVerificationCode: 'V1', fiscalQrCodeData: 'QR1',
    revenueAuthorityReference: 'RA1',
  })
  assert.equal(result.canAutomaticallyResubmit, false)
})

test('missing fiscal identifiers remain null and are not invented', () => {
  const result = parseInvoiceStatusCollection('D1', {
    error: false, invoices: [{ documentId: 'D1', status: 'FISCALIZED', error: false }],
  })
  assert.equal(result.kind, 'response')
  if (result.kind === 'response') {
    assert.equal(result.fiscalEvidence?.fiscalId, null)
    assert.equal(result.fiscalEvidence?.revenueAuthorityReference, null)
  }
})

test('malformed fiscal metadata blocks status confirmation', () => {
  for (const value of ['', 123, {}, false]) {
    const result = parseInvoiceStatusCollection('D1', {
      error: false, invoices: [{
        documentId: 'D1', status: 'FISCALIZED', error: false,
        fiscalId: value,
      }],
    })
    assert.equal(result.kind, 'unavailable')
  }
})
