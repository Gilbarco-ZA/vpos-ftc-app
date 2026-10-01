import assert from 'node:assert/strict'
import test from 'node:test'

import {
  hasAnyRole,
  hasRole,
} from '../../src/platform/auth/policies/role-policy'

test('route role lists use exact membership', () => {
  assert.equal(hasAnyRole('administrator', ['administrator']), true)
  assert.equal(hasAnyRole('manager', ['administrator']), false)
  assert.equal(hasAnyRole('tenant', ['manager', 'administrator']), false)
  assert.equal(hasAnyRole('field_engineer', ['administrator']), false)
  assert.equal(
    hasAnyRole('field_engineer', ['administrator', 'field_engineer']),
    true,
  )
})

test('hierarchical role checks remain explicit through hasRole', () => {
  assert.equal(hasRole('administrator', 'manager'), true)
  assert.equal(hasRole('manager', 'tenant'), true)
  assert.equal(hasRole('tenant', 'manager'), false)
})
