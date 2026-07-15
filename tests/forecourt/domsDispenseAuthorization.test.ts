import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  buildJplDispenseAuthorizationEnvelope,
  classifyDispenseServiceMode,
  normalizeDispenseAuthorizeParameters,
  normalizeDispenseServiceMode,
  resolveDispenseAuthorizationOperation,
} from '../../src/modules/forecourt/infrastructure/jpl/dispenseAuthorization'

describe('DOMS/JPL dispense authorization domain operations', () => {
  it('classifies protocol service-mode families without exposing raw prefixes to callers', () => {
    assert.equal(classifyDispenseServiceMode('11'), 'postpay_pos')
    assert.equal(classifyDispenseServiceMode('21'), 'prepay_pos')
    assert.equal(classifyDispenseServiceMode('31'), 'attendant_postpay')
    assert.equal(classifyDispenseServiceMode('41'), 'calibration')
    assert.equal(classifyDispenseServiceMode('51'), 'card_preauthorization')
    assert.equal(classifyDispenseServiceMode('61'), 'banknote_prepay')
    assert.equal(classifyDispenseServiceMode('91'), 'unknown')
  })

  it('normalizes service mode, fuelling group, price group, and grade restrictions', () => {
    assert.deepEqual(
      normalizeDispenseServiceMode({
        serviceModeId: 21,
        fuellingModeGroupId: 1,
        priceGroupId: 2,
        validGradeIds: [1, '01', 3],
      }),
      {
        id: '21',
        family: 'prepay_pos',
        fuellingModeGroupId: '01',
        priceGroupId: '02',
        validGradeIds: ['01', '03'],
      },
    )
  })

  it('builds a standard authorization operation', () => {
    const operation = resolveDispenseAuthorizationOperation({
      action: 'AUTHORIZE_FP',
      payload: {},
      fpId: 3,
      posId: 4,
    })

    assert.deepEqual(operation, {
      kind: 'standard',
      fpId: '03',
      posId: '04',
    })
    assert.deepEqual(buildJplDispenseAuthorizationEnvelope(operation), {
      name: 'authorize_Fp_req',
      subCode: '00H',
      data: { FpId: '03', PosId: '04' },
    })
  })

  it('builds a preset authorization with fixed-width limits', () => {
    const operation = resolveDispenseAuthorizationOperation({
      action: 'PRESET_FUEL_AUTH',
      payload: {
        presetType: 2,
        moneyPresetLimit: 1250,
        floorPresetLimit: '50',
      },
      fpId: 3,
      posId: 4,
    })

    assert.equal(operation.kind, 'preset')
    assert.deepEqual(buildJplDispenseAuthorizationEnvelope(operation), {
      name: 'authorize_Fp_req',
      subCode: '01H',
      data: {
        FpId: '03',
        PosId: '04',
        PresetType: '02H',
        MoneyPresetLimit: '001250',
        FloorPresetLimit: '000050',
      },
    })
  })

  it('builds a prepay preparation using a typed 2x service mode and extended money limit', () => {
    const operation = resolveDispenseAuthorizationOperation({
      action: 'PREPAY_PREPARE',
      payload: {
        serviceModeId: 21,
        fuellingModeGroupId: 1,
        priceGroupId: 2,
        validGradeIds: [2, 2, 3],
        extendedStartLimit: {
          type: 2,
          moneyLimit: 5000,
        },
      },
      fpId: 6,
      posId: 8,
    })

    assert.equal(operation.kind, 'prepay')
    if (operation.kind !== 'prepay') return
    assert.equal(operation.serviceMode?.family, 'prepay_pos')
    assert.deepEqual(buildJplDispenseAuthorizationEnvelope(operation), {
      name: 'prepare_Trans_req',
      subCode: '01H',
      data: {
        FpId: '06',
        PosId: '08',
        AuthorizePars: {
          SmId: '21',
          FmgId: '01',
          PgId: '02',
          ValidGrades: ['02', '03'],
          StartLimit_e: {
            StartLimitType_e: '02H',
            MoneyPresetLimit_e: '0000005000',
          },
        },
      },
    })
  })

  it('accepts domain-style extended limit aliases while emitting protocol field names', () => {
    assert.deepEqual(
      normalizeDispenseAuthorizeParameters({
        serviceModeId: 21,
        extendedStartLimit: {
          startLimitTypeE: 2,
          moneyLimitE: 875,
          floorLimitE: 25,
        },
      }),
      {
        SmId: '21',
        StartLimit_e: {
          StartLimitType_e: '02H',
          MoneyPresetLimit_e: '0000000875',
          FloorPresetLimit_e: '0000000025',
        },
      },
    )
  })

  it('normalizes nested extended authorization parameters instead of bypassing validation', () => {
    const parameters = normalizeDispenseAuthorizeParameters({
      AuthorizePars: {
        SmId: '51',
        FmgId: 1,
        PgId: 2,
        ValidGrades: [1, '03'],
        StartLimit_e: {
          StartLimitType_e: '02H',
          MoneyPresetLimit_e: 2500,
        },
        AutoLockId: 4,
        LockFpPrices: '0',
      },
    })

    assert.deepEqual(parameters, {
      SmId: '51',
      FmgId: '01',
      PgId: '02',
      ValidGrades: ['01', '03'],
      AutoLockId: '04',
      LockFpPrices: 0,
      StartLimit_e: {
        StartLimitType_e: '02H',
        MoneyPresetLimit_e: '0000002500',
      },
    })
  })

  it('rejects malformed and over-width preset values before transport', () => {
    assert.throws(
      () =>
        resolveDispenseAuthorizationOperation({
          action: 'PRESET_FUEL_AUTH',
          payload: { moneyPresetLimit: '12.50' },
          fpId: 3,
          posId: 4,
        }),
      /numeric value/i,
    )
    assert.throws(
      () =>
        resolveDispenseAuthorizationOperation({
          action: 'PREPAY_PREPARE',
          payload: {
            serviceModeId: 21,
            extendedStartLimit: {
              type: 2,
              moneyLimit: '10000000000',
            },
          },
          fpId: 3,
          posId: 4,
        }),
      /at most 10 digits/i,
    )
  })
})
