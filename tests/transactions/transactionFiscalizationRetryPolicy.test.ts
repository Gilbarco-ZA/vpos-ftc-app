import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { requiresCustomerForFiscalizationRetry } from '../../src/modules/transactions/domain/fiscalization-retry-policy'

describe('transaction fiscalization retry customer policy', () => {
  it('allows anonymous DOMS/JPL transactions to be retried', () => {
    assert.equal(
      requiresCustomerForFiscalizationRetry({
        customerId: null,
        domsSourceSystem: 'jpl',
      }),
      false,
    )
  })

  it('keeps customer linkage required for non-DOMS transactions', () => {
    assert.equal(
      requiresCustomerForFiscalizationRetry({
        customerId: null,
        domsSourceSystem: null,
      }),
      true,
    )
    assert.equal(
      requiresCustomerForFiscalizationRetry({
        customerId: 'customer-1',
        domsSourceSystem: null,
      }),
      false,
    )
  })
})
