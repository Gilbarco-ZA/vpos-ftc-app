import assert from 'node:assert/strict'
import test from 'node:test'

import {
  TANZANIA_CUSTOMER_ID_TYPES,
  resolveTanzaniaCustomerIdentity,
} from '../../src/modules/tanzania-fiscal/domain/customerIdentity'

test('uses customer ID type 1 and requires the captured TIN', () => {
  assert.deepEqual(resolveTanzaniaCustomerIdentity({ tin: ' 139867823 ' }), {
    customerIdType: TANZANIA_CUSTOMER_ID_TYPES.TIN,
    customerId: '139867823',
  })
})

test('uses NIL without a customer ID when no TIN was captured', () => {
  assert.deepEqual(resolveTanzaniaCustomerIdentity(null), {
    customerIdType: TANZANIA_CUSTOMER_ID_TYPES.NIL,
    customerId: '',
  })
  assert.deepEqual(resolveTanzaniaCustomerIdentity({ tin: '  ' }), {
    customerIdType: TANZANIA_CUSTOMER_ID_TYPES.NIL,
    customerId: '',
  })
})
