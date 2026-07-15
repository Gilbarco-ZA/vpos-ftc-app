import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { getDomsJplSimulatorValidationSteps } from '../../src/modules/forecourt/infrastructure/jpl/simulatorValidation'

describe('DOMS/JPL simulator validation runner', () => {
  it('keeps the minimal scenario focused on safe bootstrap and core reads', () => {
    const steps = getDomsJplSimulatorValidationSteps('minimal')
    const ids = steps.map((step) => step.id)

    assert.ok(ids.includes('fc-status'))
    assert.ok(ids.includes('fc-install-status'))
    assert.ok(ids.includes('fp-status-all'))
    assert.ok(ids.includes('safe-reject-path'))
    assert.ok(!ids.includes('fp-supervised-transaction-read'))
    assert.ok(!ids.includes('tg-data'))
    assert.ok(!ids.includes('vending-status'))
  })

  it('covers transaction, wetstock, special-record, and optional-module reads in the full scenario', () => {
    const ids = getDomsJplSimulatorValidationSteps('full').map((step) => step.id)

    assert.ok(ids.includes('fc-service-log-read'))
    assert.ok(ids.includes('bor-read'))
    assert.ok(ids.includes('client-data-read'))
    assert.ok(ids.includes('fp-supervised-transaction-read'))
    assert.ok(ids.includes('fp-unsupervised-transaction-read'))
    assert.ok(ids.includes('tg-status-all'))
    assert.ok(ids.includes('tg-data'))
    assert.ok(ids.includes('site-delivery-status'))
    assert.ok(ids.includes('tank-delivery-data'))
    assert.ok(ids.includes('price-pole-status'))
    assert.ok(ids.includes('wash-status'))
    assert.ok(ids.includes('wash-transaction-read'))
    assert.ok(ids.includes('digital-io-status'))
    assert.ok(ids.includes('sensor-status'))
    assert.ok(ids.includes('vending-status'))
    assert.ok(ids.includes('vending-totals'))
  })
})
