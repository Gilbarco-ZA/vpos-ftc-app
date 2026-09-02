import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(here, '../..')
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8')

test('Tanzania admin TRA registration uses certificate upload instead of Base64 text fields', () => {
  const client = read('components/admin/TanzaniaProxyRegistrationClient.tsx')

  assert.match(client, /type="file"/)
  assert.match(client, /accept="\.pfx,\.p12,application\/x-pkcs12"/)
  assert.match(client, /reader\.readAsDataURL\(file\)/)
  assert.match(client, /const marker = 'base64,'/)
  assert.match(client, /certificateBase64,/)
  assert.match(client, /certificatePassphrase,/)

  assert.doesNotMatch(client, /Certificate serial \(Base64\)/)
  assert.doesNotMatch(client, /Private key \(Base64\)/)
  assert.doesNotMatch(client, /Public key \(Base64\)/)
})

test('Tanzania TRA registration derives proxy key material from the uploaded PKCS#12 package', () => {
  const registration = read(
    'src/modules/tanzania-fiscal/application/proxyRegistration.ts',
  )

  assert.match(registration, /certificateBase64\?: unknown/)
  assert.match(registration, /await importTraPkcs12\(/)
  assert.match(registration, /certSerial: imported\.proxyCertSerialBase64/)
  assert.match(registration, /privateKeyBase64: imported\.privateKeyBase64/)
  assert.match(registration, /publicKeyBase64: imported\.publicKeyBase64/)
})
