import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { createDomsJplSimulator } from '../../src/modules/forecourt/infrastructure/jpl/simulator'
import {
  getDomsJplLiveValidationSteps,
  validateDomsJplLiveReadOnlyTarget,
} from '../../src/modules/forecourt/infrastructure/jpl/liveValidation'

describe('DOMS/JPL live read-only validation runner', () => {
  it('keeps live validation free of transaction-buffer reads and write commands', () => {
    const steps = getDomsJplLiveValidationSteps('full-readonly', true)
    const names = steps.map((step) => step.request.name)

    assert.ok(names.includes('FcStatus_req'))
    assert.ok(names.includes('FpStatus_req'))
    assert.ok(names.includes('TgStatus_req'))
    assert.ok(names.includes('PpStatus_req'))
    assert.ok(names.includes('Unsupported_req'))

    assert.ok(!names.includes('FpSupTrans_req'))
    assert.ok(!names.includes('FpUnSupTrans_req'))
    assert.ok(!names.includes('clear_FpSupTrans_req'))
    assert.ok(!names.includes('clear_FpUnSupTrans_req'))
    assert.ok(!names.includes('authorize_Fp_req'))
    assert.ok(!names.includes('change_FcPriceSet_req'))
    assert.ok(!names.includes('change_DynamicTankData_req'))
    assert.ok(!names.includes('clear_InstallData_req'))
  })

  it('validates a simulator endpoint using the same live read-only profile and emits live-controller evidence', async () => {
    const simulator = createDomsJplSimulator({ port: 0, scenario: 'full' })
    const started = await simulator.start()

    try {
      const report = await validateDomsJplLiveReadOnlyTarget({
        host: started.host,
        port: started.port,
        profile: 'minimal-readonly',
        timeoutMs: 1000,
        idleCollectMs: 25,
      })

      assert.equal(report.mode, 'doms-jpl-live-readonly-validation')
      assert.equal(report.status, 'passed')
      assert.equal(report.summary.connected, true)
      assert.equal(report.summary.sessionReady, true)
      assert.equal(report.summary.logonPassed, true)
      assert.equal(report.summary.installStatusCaptured, true)
      assert.equal(report.safetyBoundary.pssWritesAttempted, false)
      assert.equal(report.safetyBoundary.transactionBufferReadsAttempted, false)
      assert.equal(report.fieldValidationEvidenceImport.evidenceType, 'live-controller')
      assert.equal(
        report.fieldValidationEvidenceImport.confirmManualValidation,
        false,
      )
    } finally {
      await simulator.stop()
    }
  })

  it('accepts solicited responses without correlation IDs when requests are serialized', async () => {
    const simulator = createDomsJplSimulator({
      port: 0,
      scenario: 'full',
      echoCorrelationId: false,
    })
    const started = await simulator.start()

    try {
      const report = await validateDomsJplLiveReadOnlyTarget({
        host: started.host,
        port: started.port,
        profile: 'minimal-readonly',
        timeoutMs: 1000,
        idleCollectMs: 25,
      })

      assert.equal(report.status, 'passed')
      assert.equal(report.summary.welcomeReceived, true)
      assert.equal(report.summary.logonPassed, true)
      assert.ok(report.diagnostics.uncorrelatedResponseFallbacks > 0)
      assert.ok(
        report.steps.some(
          (step) =>
            step.id === 'connection-bootstrap' &&
            step.correlationMatch === 'absent',
        ),
      )
      assert.ok(
        report.steps
          .filter((step) => step.category !== 'bootstrap')
          .every((step) => step.correlationMatch === 'absent'),
      )
    } finally {
      await simulator.stop()
    }
  })
})

it('uses the protocol-defined read request variants for live dispense and wetstock probes', () => {
  const steps = getDomsJplLiveValidationSteps('full-readonly')
  const byId = new Map(steps.map((step) => [step.id, step]))

  assert.deepEqual(byId.get('fp-info')?.request, {
    name: 'FpInfo_req',
    subCode: '01H',
    data: { FpId: '01', FpInfoParId: ['02'] },
  })
  assert.deepEqual(byId.get('fp-fuelling-data')?.request, {
    name: 'FpFuellingData_req',
    subCode: '01H',
    data: { FpId: '01' },
  })
  assert.deepEqual(byId.get('tg-data')?.request, {
    name: 'TgData_req',
    subCode: '00H',
    data: {
      TgId: '01',
      TankDataItemId: ['01', '02', '03', '04', '05', '06', '07', '08'],
    },
  })
  assert.deepEqual(byId.get('tank-control-status')?.request, {
    name: 'TankControlStatus_req',
    subCode: '00H',
    data: { TankId: '00' },
  })
})

it('accepts unsolicited tank-control status observed during startup as live evidence', async () => {
  const simulator = createDomsJplSimulator({ port: 0, scenario: 'full' })
  const started = await simulator.start()

  try {
    const report = await validateDomsJplLiveReadOnlyTarget({
      host: started.host,
      port: started.port,
      profile: 'wetstock-readonly',
      timeoutMs: 1000,
      idleCollectMs: 100,
    })

    const tankControl = report.steps.find(
      (step) => step.id === 'tank-control-status',
    )

    assert.equal(tankControl?.status, 'passed')
    assert.equal(tankControl?.correlationId, 'startup-observation')
    assert.match(tankControl?.operationalOutcome ?? '', /unsolicited/i)
  } finally {
    await simulator.stop()
  }
})
