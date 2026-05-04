import assert from 'node:assert/strict'
import test from 'node:test'

import { resolveDeductionProxyStatusForFiscalizedTransaction } from '@/src/modules/tank-levels/application/deductionProxyStatus'

test('fiscalized transaction deductions are marked as sent for tank-level proxy status', () => {
  assert.equal(resolveDeductionProxyStatusForFiscalizedTransaction(), 'SENT')
})
