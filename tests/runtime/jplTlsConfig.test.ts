import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import type { ForecourtRuntimeConfig } from '@/src/modules/forecourt/infrastructure/runtimeConfig'
import {
  buildJplTlsClientOptions,
  summarizeJplTlsConfig,
} from '@/src/modules/forecourt/infrastructure/jpl/tlsConfig'

const baseConfig = (): ForecourtRuntimeConfig => ({
  mode: 'jpl_tcp',
  jplOperationMode: 'supervised',
  jplHost: 'pss.local',
  jplPort: 8888,
  jplPosId: '01',
  jplAccessCode: 'POS,RI',
  jplCountryCode: '1',
  jplPosVersionId: '470-02-1.08',
  jplUnsolicitedDrSeconds: 5,
  jplHeartbeatIntervalMs: 15_000,
  jplDeadConnectionTimeoutMs: 30_000,
  jplExpectedMinVersion: '470-02-1.07',
  jplUnsolicitedFlags: [],
  jplUnsolicitedMfdrFlags: [],
  jplStatusUpdateCode: 3,
  jplBootstrapSnapshotEnabled: true,
  bufferWarnDepthSup: 2,
  bufferCritDepthSup: 5,
  bufferWarnAgeMinSup: 5,
  bufferCritAgeMinSup: 15,
  bufferWarnDepthUnsup: 1,
  bufferCritDepthUnsup: 3,
  bufferWarnAgeMinUnsup: 2,
  bufferCritAgeMinUnsup: 10,
})

test('does not configure TLS on the standard port unless required', () => {
  assert.equal(buildJplTlsClientOptions(baseConfig()), undefined)
})

test('loads CA and mutual TLS material without exposing PEM in summary', () => {
  const dir = mkdtempSync(join(tmpdir(), 'jpl-tls-'))
  const caPath = join(dir, 'ca.pem')
  const certPath = join(dir, 'client.pem')
  const keyPath = join(dir, 'client-key.pem')
  writeFileSync(caPath, 'CA DATA')
  writeFileSync(certPath, 'CERT DATA')
  writeFileSync(keyPath, 'KEY DATA')

  const cfg: ForecourtRuntimeConfig = {
    ...baseConfig(),
    jplPort: 8889,
    jplTlsRequired: true,
    jplTlsCaPath: caPath,
    jplTlsClientCertPath: certPath,
    jplTlsClientKeyPath: keyPath,
    jplTlsServername: 'pss.example.test',
    jplTlsMinVersion: 'TLSv1.3',
  }

  const tls = buildJplTlsClientOptions(cfg)
  assert.equal(tls?.enabled, true)
  assert.equal(tls?.ca?.toString(), 'CA DATA')
  assert.equal(tls?.cert?.toString(), 'CERT DATA')
  assert.equal(tls?.key?.toString(), 'KEY DATA')
  assert.equal(tls?.servername, 'pss.example.test')
  assert.equal(tls?.minVersion, 'TLSv1.3')

  assert.deepEqual(summarizeJplTlsConfig(cfg), {
    enabled: true,
    rejectUnauthorized: true,
    servername: 'pss.example.test',
    minVersion: 'TLSv1.3',
    caConfigured: true,
    clientCertificateConfigured: true,
  })
})

test('rejects partial mutual TLS configuration', () => {
  const dir = mkdtempSync(join(tmpdir(), 'jpl-tls-partial-'))
  const certPath = join(dir, 'client.pem')
  writeFileSync(certPath, 'CERT DATA')

  assert.throws(
    () =>
      buildJplTlsClientOptions({
        ...baseConfig(),
        jplPort: 8889,
        jplTlsClientCertPath: certPath,
      }),
    /requires both JPL_TLS_CLIENT_CERT_PATH and JPL_TLS_CLIENT_KEY_PATH/,
  )
})
