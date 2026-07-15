import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { normalizeDomsDynamicTankDataRequest } from '../../src/modules/forecourt/infrastructure/jpl/dynamicTankData'
import { buildJplCommandRequest } from '../../src/modules/forecourt/infrastructure/jpl/protocol/commands'

describe('DOMS/JPL dynamic tank data governance', () => {
  it('normalizes EnteredDensity into the strict protocol payload', () => {
    const normalized = normalizeDomsDynamicTankDataRequest({
      tankId: '3',
      densityValue: '745',
      expireDateAndTime: '20260709143000',
      scrollingSpeed: '0x01',
      text: 'Manual density after dip sheet',
      requestedBy: 'operator-1',
      requestedRole: 'administrator',
      reason: 'Density not supplied by gauge',
    })

    assert.equal(normalized.tankId, '03')
    assert.equal(normalized.dtdPars.EnteredDensity.DensityValue, '000000000745')
    assert.equal(normalized.dtdPars.EnteredDensity.ScrollingSpeed, '01H')
    assert.equal(normalized.severity, 'info')
    assert.equal(normalized.validationWarnings.length, 0)
  })

  it('builds change_DynamicTankData_req with only allowed DtdPars', () => {
    const request = buildJplCommandRequest('CHANGE_DYNAMIC_TANK_DATA', {
      tankId: '5',
      dtdPars: {
        EnteredDensity: {
          DensityValue: '812',
          ExpireDateAndTime: '20260710120000',
          ScrollingSpeed: '00H',
          Text: 'manual density',
        },
      },
      requestedRole: 'administrator',
      reason: 'Lab density certificate',
    })

    assert.equal(request?.name, 'change_DynamicTankData_req')
    assert.equal(request?.subCode, '00H')
    assert.deepEqual(request?.data, {
      TankId: '05',
      DtdPars: {
        EnteredDensity: {
          DensityValue: '000000000812',
          ExpireDateAndTime: '20260710120000',
          ScrollingSpeed: '00H',
          Text: 'manual density',
        },
      },
    })
  })

  it('rejects unsupported dynamic tank parameter writes', () => {
    assert.throws(
      () =>
        buildJplCommandRequest('CHANGE_DYNAMIC_TANK_DATA', {
          tankId: '5',
          dtdPars: {
            EnteredDensity: {
              DensityValue: '812',
              ExpireDateAndTime: '20260710120000',
              ScrollingSpeed: '00H',
              Text: 'manual density',
            },
            UnsupportedField: { value: 'x' },
          },
        }),
      /Unsupported dynamic tank data parameter/,
    )
  })

  it('flags missing reason and low-privilege role as operator warnings', () => {
    const normalized = normalizeDomsDynamicTankDataRequest({
      tankId: '7',
      densityValue: '745',
      expireDateAndTime: '20260710120000',
      requestedRole: 'cashier',
    })

    assert.equal(normalized.severity, 'critical')
    assert.ok(
      normalized.validationWarnings.some((warning) =>
        warning.includes('business reason'),
      ),
    )
    assert.ok(
      normalized.validationWarnings.some((warning) =>
        warning.includes('administrators or field engineers'),
      ),
    )
  })
})
