import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  buildDynamicTankDataAuditPatch,
  hashDomsDynamicTankData,
  normalizeDomsDynamicTankDataRequest,
} from '@/src/modules/forecourt/infrastructure/jpl/dynamicTankData'
import {
  buildTankGaugeDiagnostics,
  hashTankGaugePayload,
} from '@/src/modules/forecourt/domain/tankGaugeDiagnostics'

describe('dynamic tank data edge cases', () => {
  it('normalizes aliases, whitespace, text length, and missing expiry', () => {
    const normalized = normalizeDomsDynamicTankDataRequest({
      TankId: 8,
      DtdPars: {
        enteredDensity: {
          densityValue: '700',
          scrollingSpeed: '1',
          text: `  density\nupdated\t${'x'.repeat(100)}  `,
        },
      },
      userId: ' operator-1 ',
      userRole: 'field_engineer',
      comment: ' dip sheet ',
      source: ' admin ',
    })

    assert.equal(normalized.tankId, '08')
    assert.equal(normalized.dtdPars.EnteredDensity.DensityValue, '000000000700')
    assert.equal(normalized.dtdPars.EnteredDensity.ExpireDateAndTime, '00000000000000')
    assert.equal(normalized.dtdPars.EnteredDensity.ScrollingSpeed, '01H')
    assert.equal(normalized.dtdPars.EnteredDensity.Text.length, 80)
    assert.equal(normalized.requestedBy, 'operator-1')
    assert.equal(normalized.reason, 'dip sheet')
    assert.equal(normalized.source, 'admin')
    assert.equal(normalized.severity, 'warning')
    assert.match(normalized.sourceHash, /^[0-9a-f]{64}$/)
    assert.deepEqual(buildDynamicTankDataAuditPatch(normalized), {
      id: normalized.id,
      tankId: normalized.tankId,
      requestedBy: normalized.requestedBy,
      requestedRole: normalized.requestedRole,
      reason: normalized.reason,
      source: normalized.source,
      severity: normalized.severity,
      validationWarnings: normalized.validationWarnings,
      sourceHash: normalized.sourceHash,
      payloadJson: normalized.payloadJson,
    })
  })

  it('rejects invalid or non-positive density values', () => {
    for (const densityValue of ['', '0', '-1', '12.3', '1234567890123']) {
      assert.throws(
        () =>
          normalizeDomsDynamicTankDataRequest({
            tankId: 1,
            densityValue,
          }),
        /DensityValue/,
      )
    }
  })

  it('uses stable hashes regardless of object key order', () => {
    assert.equal(
      hashDomsDynamicTankData({ b: 2, a: { d: 4, c: 3 } }),
      hashDomsDynamicTankData({ a: { c: 3, d: 4 }, b: 2 }),
    )
    assert.equal(
      hashTankGaugePayload({ b: 2, a: [3, 4] }),
      hashTankGaugePayload({ a: [3, 4], b: 2 }),
    )
  })

  it('keeps explicit zero measurements in compact tank diagnostics', () => {
    const diagnostics = buildTankGaugeDiagnostics({
      tgId: '02',
      liveVolumeLitres: 0,
      waterVolumeLitres: 0,
      averageTemperatureC: 0,
      sourcePayload: null,
    })

    assert.equal(diagnostics.liveVolumeLitres, 0)
    assert.equal(diagnostics.waterVolumeLitres, 0)
    assert.equal(diagnostics.averageTemperatureC, 0)
    assert.equal(diagnostics.capturedAt, null)
    assert.match(diagnostics.sourcePayloadHash, /^[0-9a-f]{64}$/)
  })
})
