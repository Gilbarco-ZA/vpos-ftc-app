import assert from 'node:assert/strict'
import test from 'node:test'

import { compareDomsMaintenanceCommandEnvelopes } from '../../src/modules/forecourt/application/compareDomsMaintenanceCommand'

const preview = {
  name: 'clear_InstallData_req',
  subCode: '01H',
  data: { ExtendedInstallMsgCode: '0010H', FcDeviceId: '04' },
}

test('reports an exact match independent of object property order', () => {
  const result = compareDomsMaintenanceCommandEnvelopes({
    previewId: 'clear-fp-install-4',
    previewEnvelope: preview,
    executableEnvelope: {
      data: { FcDeviceId: '04', ExtendedInstallMsgCode: '0010H' },
      subCode: '01H',
      name: 'clear_InstallData_req',
    },
    confirmComparisonOnly: true,
    confirmNoDomsCommand: true,
  })

  assert.equal(result.exactMatch, true)
  assert.equal(result.differenceCount, 0)
  assert.equal(result.previewDigest, result.executableDigest)
  assert.equal(result.executionEnabled, false)
  assert.equal(result.sendsDomsCommand, false)
})

test('reports field-level differences and blocks advancement', () => {
  const result = compareDomsMaintenanceCommandEnvelopes({
    previewEnvelope: preview,
    executableEnvelope: {
      ...preview,
      data: { ...preview.data, FcDeviceId: '05' },
    },
    confirmComparisonOnly: true,
    confirmNoDomsCommand: true,
  })

  assert.equal(result.exactMatch, false)
  assert.equal(result.canAdvanceToFinalConfirmation, false)
  assert.equal(result.differenceCount, 1)
  assert.equal(result.differences[0]?.path, '$.data.FcDeviceId')
})

test('requires explicit no-send confirmations', () => {
  assert.throws(
    () =>
      compareDomsMaintenanceCommandEnvelopes({
        previewEnvelope: preview,
        executableEnvelope: preview,
      }),
    /confirmComparisonOnly must be confirmed/,
  )
})
