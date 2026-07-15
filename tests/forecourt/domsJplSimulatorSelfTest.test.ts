import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { runDomsJplSimulatorSelfTest } from '../../src/modules/forecourt/infrastructure/jpl/simulatorSelfTest'

describe('DOMS/JPL simulator self-test', () => {
  it('starts a local simulator, validates the minimal flow, and returns importable field-validation evidence', async () => {
    const report = await runDomsJplSimulatorSelfTest({
      port: 0,
      scenario: 'minimal',
      timeoutMs: 1000,
      idleCollectMs: 25,
    })

    assert.equal(report.mode, 'doms-jpl-simulator-self-test')
    assert.equal(report.simulator.scenario, 'minimal')
    assert.ok(report.simulator.port > 0)
    assert.equal(report.summary.simulatorStarted, true)
    assert.equal(report.summary.simulatorStopped, true)
    assert.equal(report.summary.reportCanBeImported, true)
    assert.equal(report.validation.summary.logonPassed, true)
    assert.equal(report.fieldValidationEvidenceImport.evidenceType, 'jpl-simulator')
    assert.equal(
      report.fieldValidationEvidenceImport.sourceSystem,
      'doms-jpl-simulator-self-test',
    )
  })
})
