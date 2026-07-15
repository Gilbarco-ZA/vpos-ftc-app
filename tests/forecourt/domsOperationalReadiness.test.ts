import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { buildDomsOperationalReadiness } from '../../src/modules/forecourt/application/getDomsOperationalReadiness'

const baseSnapshot = {
  stationId: 'station-1',
  generatedAt: '2026-07-09T12:00:00.000Z',
  connection: {
    connected: true,
    loggedOn: true,
    stale: false,
    secureMode: false,
    reconnectAttempts: 0,
    lastMessageAgeMs: 1000,
  },
  forecourt: {
    fcStatus: {
      FcStatus1Flags: { value: 0, bits: {} },
      FcStatus2Flags: { value: 0, bits: {} },
    },
  },
  dispense: {
    summary: { uniqueCount: 2 },
    severityCounts: { ok: 2 },
    pumps: [],
    recentErrors: [],
  },
  wetstock: {
    summary: { uniqueCount: 2 },
    severityCounts: { ok: 2 },
    tanks: [],
    recentTankDeliveryData: [],
    siteDeliveryStatus: { normalized: { clearCandidates: [] } },
  },
  optionalModules: {
    pricePoles: { summary: { uniqueCount: 0 }, severityCounts: {} },
    wash: { summary: { uniqueCount: 0 }, severityCounts: {} },
    digitalIo: { summary: { uniqueCount: 0 }, severityCounts: {} },
    sensors: { summary: { uniqueCount: 0 }, severityCounts: {} },
    vending: { summary: { uniqueCount: 0 }, severityCounts: {} },
  },
  specialRecords: { serviceMessages: [], backOfficeRecords: [] },
}

const passedFieldValidation = {
  generatedAt: '2026-07-09T12:01:00.000Z',
  releaseGate: { status: 'passed', passed: true, latestEvidenceAt: '2026-07-09T12:01:00.000Z' },
  blockingItems: [],
}

describe('DOMS operational readiness rollup', () => {
  it('marks the runtime ready when no operational sections have actions', () => {
    const readiness = buildDomsOperationalReadiness({
      stationId: 'station-1',
      domainSnapshot: baseSnapshot,
      fieldValidation: passedFieldValidation,
    })

    assert.equal(readiness.overallStatus, 'ready')
    assert.equal(readiness.operatorDecision.canProceedWithLiveOperations, true)
    assert.equal(readiness.summary.blockingActionCount, 0)
  })

  it('blocks operation when the JPL session is stale and not logged on', () => {
    const readiness = buildDomsOperationalReadiness({
      stationId: 'station-1',
      domainSnapshot: {
        ...baseSnapshot,
        connection: {
          connected: true,
          loggedOn: false,
          stale: true,
          lastMessageAgeMs: 60000,
          deadConnectionTimeoutMs: 30000,
        },
      },
      fieldValidation: passedFieldValidation,
    })

    assert.equal(readiness.overallStatus, 'blocked')
    assert.equal(readiness.operatorDecision.canProceedWithLiveOperations, false)
    assert.ok(
      readiness.actionItems.some((item) => item.id === 'jpl-logon-not-complete'),
    )
    assert.ok(
      readiness.actionItems.some((item) => item.id === 'jpl-inbound-traffic-stale'),
    )
  })

  it('surfaces hardware/software incompatibility as a first-class critical action', () => {
    const readiness = buildDomsOperationalReadiness({
      stationId: 'station-1',
      domainSnapshot: {
        ...baseSnapshot,
        forecourt: {
          fcStatus: {
            FcStatus1Flags: { value: 0, bits: {} },
            FcStatus2Flags: {
              value: 4,
              bits: { HwSwIncompatibilityWithinFc: 4 },
            },
          },
        },
      },
      fieldValidation: passedFieldValidation,
    })

    assert.equal(readiness.overallStatus, 'blocked')
    assert.ok(
      readiness.actionItems.some(
        (item) => item.id === 'fc-hardware-software-incompatibility',
      ),
    )
  })

  it('blocks release when field-validation release gate is not passed', () => {
    const readiness = buildDomsOperationalReadiness({
      stationId: 'station-1',
      domainSnapshot: baseSnapshot,
      fieldValidation: {
        releaseGate: { status: 'blocked', passed: false },
        blockingItems: [{ id: 'local-build-completed' }],
      },
    })

    assert.equal(readiness.overallStatus, 'blocked')
    assert.equal(readiness.summary.blockingActionCount, 1)
    assert.ok(
      readiness.actionItems.some((item) => item.id === 'release-gate-not-passed'),
    )
  })
})
