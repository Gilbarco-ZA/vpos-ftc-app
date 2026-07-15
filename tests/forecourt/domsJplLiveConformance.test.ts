import assert from 'node:assert/strict'
import test from 'node:test'

import { assessDomsJplLiveConformance } from '@/src/modules/forecourt/infrastructure/jpl/liveConformance'

test('validates live FpStatus parsing and explicit money/volume scaling', () => {
  const report = assessDomsJplLiveConformance(
    [
      {
        name: 'MultiMessage_resp',
        subCode: '00H',
        solicited: true,
        data: {
          messages: [
            {
              name: 'FpStatus_resp',
              subCode: '03H',
              data: {
                FpId: '01',
                SmId: '01',
                FpMainState: { enum: { Idle: '01H' }, value: '01H' },
                FpSubStates: { value: 84, bits: { IsOnline: 4 } },
                FpLockId: '00',
              },
            },
          ],
        },
      },
      {
        name: 'FpFuellingData_resp',
        subCode: '01H',
        solicited: true,
        data: {
          FpId: '01',
          Vol_e: '0000012345',
          Money_e: '0000009876',
        },
      },
    ],
    { moneyDecimals: 2, volumeDecimals: 3 },
  )

  assert.equal(report.status, 'passed')
  assert.equal(report.summary.fpStatusParserValidated, true)
  assert.equal(report.summary.valueNormalizationValidated, true)
  assert.equal(
    report.valueObservations.find((item) => item.kind === 'volume')?.scaled,
    12.345,
  )
  assert.equal(
    report.valueObservations.find((item) => item.kind === 'money')?.scaled,
    98.76,
  )
})

test('reports missing FpStatus fields and non-numeric values', () => {
  const report = assessDomsJplLiveConformance(
    [
      {
        name: 'FpStatus_resp',
        subCode: '00H',
        solicited: false,
        data: { FpId: '01' },
      },
      {
        name: 'FpFuellingData_resp',
        subCode: '01H',
        solicited: true,
        data: { FpId: '01', Vol_e: '12.34', Money_e: '9876' },
      },
    ],
    { moneyDecimals: 2, volumeDecimals: 3 },
  )

  assert.equal(report.status, 'failed')
  assert.equal(report.summary.fpStatusParserValidated, false)
  assert.ok(
    report.findings.some(
      (finding) => finding.code === 'FP_STATUS_REQUIRED_FIELDS_MISSING',
    ),
  )
  assert.ok(
    report.findings.some(
      (finding) => finding.code === 'NON_NUMERIC_JPL_VALUE',
    ),
  )
})

test('keeps value normalization pending when decimal settings are absent', () => {
  const report = assessDomsJplLiveConformance([
    {
      name: 'FpFuellingData_resp',
      subCode: '01H',
      solicited: true,
      data: { FpId: '01', Vol_e: '12345', Money_e: '9876' },
    },
  ])

  assert.equal(report.status, 'warning')
  assert.equal(report.summary.valueNormalizationValidated, false)
  assert.equal(report.valueObservations[0]?.scaled, null)
})
