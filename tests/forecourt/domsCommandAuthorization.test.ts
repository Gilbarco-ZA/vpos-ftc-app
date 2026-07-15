import assert from 'node:assert/strict'
import test from 'node:test'

import {
  authorizeDomsCommand,
  resolveDomsCommandType,
} from '../../src/modules/doms/application/domsCommandAuthorization'

test('resolves generic send command types consistently', () => {
  assert.equal(resolveDomsCommandType('send', { type: 'reset-fp' }), 'RESET_FP')
  assert.equal(resolveDomsCommandType('send', { type: ' estop fp ' }), 'ESTOP_FP')
  assert.equal(resolveDomsCommandType('clearFpError', {}), 'CLEAR_FP_ERROR')
})

test('restricts reset and cancel-estop commands to administrators', () => {
  for (const type of ['RESET_FP', 'FORCE_RESET_FP', 'CANCEL_FP_ESTOP']) {
    const manager = authorizeDomsCommand({
      role: 'manager',
      commandName: 'send',
      payload: { type },
    })
    assert.equal(manager.allowed, false, type)
    assert.deepEqual(manager.requiredRoles, ['administrator'])

    const administrator = authorizeDomsCommand({
      role: 'administrator',
      commandName: 'send',
      payload: { type },
    })
    assert.equal(administrator.allowed, true, type)
  }
})

test('allows managers to perform emergency stop and controlled error clear', () => {
  for (const type of ['ESTOP_FP', 'CLEAR_FP_ERROR']) {
    const decision = authorizeDomsCommand({
      role: 'manager',
      commandName: 'send',
      payload: { type },
    })
    assert.equal(decision.allowed, true, type)
  }
})

test('does not weaken the route-level tenant restriction', () => {
  const decision = authorizeDomsCommand({
    role: 'tenant',
    commandName: 'send',
    payload: { type: 'ESTOP_FP' },
  })
  assert.equal(decision.allowed, false)
})
