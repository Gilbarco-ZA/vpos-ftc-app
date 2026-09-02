import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { importTraPkcs12 } from '../../src/modules/tanzania-fiscal/infrastructure/pkcs12'

const hasOpenSsl = () => {
  try {
    execFileSync('openssl', ['version'], { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

test('TRA PFX import derives the PEM signing key and Cert-Serial value', async (t) => {
  if (!hasOpenSsl()) {
    t.skip('OpenSSL is not installed in this runtime')
    return
  }

  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'vpos-pfx-test-'))
  const keyPath = path.join(tempDir, 'key.pem')
  const certPath = path.join(tempDir, 'cert.pem')
  const pfxPath = path.join(tempDir, 'cert.pfx')

  try {
    execFileSync(
      'openssl',
      [
        'req',
        '-x509',
        '-newkey',
        'rsa:2048',
        '-keyout',
        keyPath,
        '-out',
        certPath,
        '-days',
        '1',
        '-nodes',
        '-subj',
        '/CN=VPOS TRA Test',
      ],
      { stdio: 'ignore' },
    )
    execFileSync(
      'openssl',
      [
        'pkcs12',
        '-export',
        '-out',
        pfxPath,
        '-inkey',
        keyPath,
        '-in',
        certPath,
        '-passout',
        'pass:testpass',
      ],
      { stdio: 'ignore' },
    )

    const imported = await importTraPkcs12({
      payload: await fs.readFile(pfxPath),
      passphrase: 'testpass',
    })

    assert.match(imported.privateKeyPem, /PRIVATE KEY/)
    assert.match(imported.certificatePem, /BEGIN CERTIFICATE/)
    assert.ok(imported.certSerial)
    assert.equal(
      Buffer.from(imported.certSerialBase64, 'base64').toString('utf8'),
      imported.certSerial,
    )
    assert.match(
      Buffer.from(imported.proxyCertSerialBase64, 'base64').toString('utf8'),
      /^[0-9a-f]+$/,
    )
    assert.doesNotThrow(() =>
      crypto.createPrivateKey({
        key: Buffer.from(imported.privateKeyBase64, 'base64'),
        format: 'der',
        type: 'pkcs8',
      }),
    )
    assert.doesNotThrow(() =>
      crypto.createPublicKey({
        key: Buffer.from(imported.publicKeyBase64, 'base64'),
        format: 'der',
        type: 'spki',
      }),
    )
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true })
  }
})
