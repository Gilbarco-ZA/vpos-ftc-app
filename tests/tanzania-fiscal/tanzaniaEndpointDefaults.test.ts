import assert from 'node:assert/strict'
import test from 'node:test'

import {
  EWURA_DEFAULT_API_SOURCE_ID,
  EWURA_PRODUCTION_BASE_URL,
  TRA_PRODUCTION_BASE_URL,
  buildTraEndpointDetails,
} from '../../src/modules/tanzania-fiscal/infrastructure/defaults'

test('Tanzania fiscal defaults match the production fiscal service', () => {
  const endpoints = buildTraEndpointDetails(TRA_PRODUCTION_BASE_URL)

  assert.equal(endpoints.registrationUrl, 'https://vfd.tra.go.tz/api/vfdRegReq')
  assert.equal(endpoints.tokenUrl, 'https://vfd.tra.go.tz/vfdtoken')
  assert.equal(endpoints.receiptUrl, 'https://vfd.tra.go.tz/api/efdmsRctInfo')
  assert.equal(endpoints.zReportUrl, 'https://vfd.tra.go.tz/api/efdmszreport')
  assert.equal(endpoints.verificationUrl, 'https://verify.tra.go.tz')
  assert.equal(EWURA_PRODUCTION_BASE_URL, 'https://npgisretailer.ewura.go.tz/api/v1')
  assert.equal(EWURA_DEFAULT_API_SOURCE_ID, '176229195_SPNEXT')
})

test('TRA test registration endpoint keeps the lower-case path used by test', () => {
  assert.equal(
    buildTraEndpointDetails('https://vfdtest.tra.go.tz/').registrationUrl,
    'https://vfdtest.tra.go.tz/api/vfdregreq',
  )
})
