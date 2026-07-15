import assert from 'node:assert/strict'
import test from 'node:test'

import { validateDomsMaintenanceFinalConfirmation } from '../../src/modules/forecourt/application/confirmDomsMaintenanceCommand.validation'

const digest = 'a'.repeat(64)
const fieldEngineer = {
  id: 'user-1',
  stationId: 'station-1',
  username: 'engineer',
  role: 'field_engineer' as const,
}

const validInput = {
  sessionId: 'session-1',
  commandName: 'install_Fp_req',
  commandDigest: digest,
  comparisonDigest: digest,
  operatorNote: 'Validated against physical wiring and PSS Configurator.',
  confirmPhysicalTarget: true,
  confirmCommandReviewed: true,
  confirmComparisonMatched: true,
  confirmImmediateSendIntent: true,
  confirmExecutionStillDisabled: true,
}

test('accepts a matching final confirmation from a field engineer without enabling execution', () => {
  const result = validateDomsMaintenanceFinalConfirmation(
    validInput,
    fieldEngineer,
  )

  assert.equal(result.roleRequirement, 'field_engineer')
  assert.equal(result.commandDigest, digest)
  assert.equal(result.executionEnabled, false)
  assert.equal(result.sendsDomsCommand, false)
})

test('rejects final confirmation from an administrator', () => {
  assert.throws(
    () =>
      validateDomsMaintenanceFinalConfirmation(validInput, {
        ...fieldEngineer,
        role: 'administrator',
      }),
    /requires the field_engineer role/,
  )
})

test('rejects command drift after comparison', () => {
  assert.throws(
    () =>
      validateDomsMaintenanceFinalConfirmation(
        { ...validInput, comparisonDigest: 'b'.repeat(64) },
        fieldEngineer,
      ),
    /must match comparisonDigest/,
  )
})

test('requires explicit confirmation that execution remains disabled', () => {
  assert.throws(
    () =>
      validateDomsMaintenanceFinalConfirmation(
        { ...validInput, confirmExecutionStillDisabled: false },
        fieldEngineer,
      ),
    /confirmExecutionStillDisabled must be confirmed/,
  )
})
