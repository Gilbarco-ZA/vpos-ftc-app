import test from 'node:test'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'

import {
  base64CertificateSerial,
  formatCertificateSerial,
  normalizeContentForSigning,
  signXmlSha1Base64,
  verifyXmlSha1Base64,
} from '../../src/modules/tanzania-fiscal/infrastructure/certificates'

test('normalizes XML content using the vpos-fiscal-tz signing semantics', () => {
  const normalized = normalizeContentForSigning(`
    <?xml version="1.0"?>
    <NPGIS>
      <RetailerSaleTransaction>
        <TranId>1</TranId>
      </RetailerSaleTransaction>
    </NPGIS>
  `).toString('utf8')

  assert.equal(
    normalized,
    '<NPGIS><RetailerSaleTransaction><TranId>1</TranId></RetailerSaleTransaction></NPGIS>',
  )
})

test('signs and verifies XML payloads with SHA1/base64 certificates helper', () => {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 1024,
    privateKeyEncoding: { type: 'pkcs1', format: 'pem' },
    publicKeyEncoding: { type: 'spki', format: 'pem' },
  })

  const payload = '<RetailerSaleTransaction><TranId>1</TranId></RetailerSaleTransaction>'
  const signature = signXmlSha1Base64({
    payload,
    privateKeyPem: privateKey,
  })

  assert.equal(
    verifyXmlSha1Base64({
      payload,
      signature,
      publicKeyPem: publicKey,
    }),
    true,
  )
  assert.equal(
    verifyXmlSha1Base64({
      payload: payload.replace('1', '2'),
      signature,
      publicKeyPem: publicKey,
    }),
    false,
  )
})

test('formats certificate serials and keeps TRA header base64 compatibility', () => {
  assert.equal(formatCertificateSerial('0a01ff'), '0A 01 FF')
  assert.equal(base64CertificateSerial('0a01ff'), 'MEEgMDEgRkY=')
})
