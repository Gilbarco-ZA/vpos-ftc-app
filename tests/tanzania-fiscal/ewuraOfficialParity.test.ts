import test from 'node:test'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'

import {
  buildEwuraNpgisPayloadXml,
  buildSignedEwuraNpgisXml,
  parseEwuraResponseXml,
  resolveEwuraEndpoint,
  verifyEwuraResponseSignature,
} from '../../src/modules/tanzania-fiscal/infrastructure/ewura'
import { signXmlSha1Base64 } from '../../src/modules/tanzania-fiscal/infrastructure/certificates'

test('resolves official EWURA EFPP endpoint paths', () => {
  assert.equal(
    resolveEwuraEndpoint('https://npgisretailer.ewura.go.tz/api/v1', 'registration'),
    'https://npgisretailer.ewura.go.tz/api/v1/RegisterRetailStationRecords',
  )
  assert.equal(
    resolveEwuraEndpoint('https://npgisretailer.ewura.go.tz/api/v1/', 'sales'),
    'https://npgisretailer.ewura.go.tz/api/v1/PostRetailSalesTran',
  )
  assert.equal(
    resolveEwuraEndpoint('http://41.59.251.174:8082/api/v1', 'inventory'),
    'http://41.59.251.174:8082/api/v1/PostDailyStationInvSumTran',
  )
})

test('builds official EWURA NPGIS registration XML shape', () => {
  const built = buildEwuraNpgisPayloadXml({
    type: 'registration',
    apiSourceId: '176229195_SPNEXT',
    data: {
      TranId: 1,
      EWURALicenseNo: 'LIC-001',
      RetailStationName: 'Demo Station',
      OperatorTin: '123456789',
    },
    signature: 'SIG',
  })

  assert.equal(built.rootElement, 'RetailStationRegistration')
  assert.match(built.contentXml, /<RetailStationRegistration>/)
  assert.match(built.contentXml, /<APISourceId>176229195_SPNEXT<\/APISourceId>/)
  assert.match(built.xml, /<VendorSignature>SIG<\/VendorSignature>/)
})

test('signs EWURA XML using FTC secure-artifact compatible PEM keys', async () => {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 1024,
    privateKeyEncoding: { type: 'pkcs1', format: 'pem' },
    publicKeyEncoding: { type: 'spki', format: 'pem' },
  })

  const built = await buildSignedEwuraNpgisXml({
    type: 'sales',
    apiSourceId: '176229195_SPNEXT',
    data: {
      TranId: 10,
      EWURALicenseNo: 'LIC-001',
      RctVerificationCode: 'ABC10',
    },
    privateKeyPem: privateKey,
  })

  assert.match(built.xml, /<RetailerSaleTransaction>/)
  assert.match(built.signature, /^[A-Za-z0-9+/=]+$/)

  const responseXml = '<Response><TranId>10</TranId><Code>200</Code><Message>OK</Message></Response>'
  const signature = signXmlSha1Base64({
    payload: responseXml,
    privateKeyPem: privateKey,
  })
  const rawResponse = `<Ewura>${responseXml}<EwuraSignature>${signature}</EwuraSignature></Ewura>`

  assert.deepEqual(
    parseEwuraResponseXml(rawResponse).transactionId,
    '10',
  )
  assert.equal(
    verifyEwuraResponseSignature({
      rawResponse,
      publicKeyPem: publicKey,
    }),
    true,
  )
})
