import test from 'node:test'
import assert from 'node:assert/strict'

import {
  extractFiscalTzQueueItems,
  fiscalTzArtifactKvValue,
  inferFiscalTzQueueStatus,
  resolveFiscalTzArtifactTarget,
} from '../../src/modules/tanzania-fiscal/infrastructure/fiscalTzLegacy'

test('maps vpos-fiscal-tz artifact files to FTC DB/KV targets', () => {
  assert.deepEqual(resolveFiscalTzArtifactTarget('fiscal.config.json'), {
    fileName: 'fiscal.config.json',
    artifactKind: 'tra_config',
    kvKey: 'vpos.tra.config',
    dbTable: 'fiscal_config',
  })
  assert.deepEqual(resolveFiscalTzArtifactTarget('fiscal.device.json'), {
    fileName: 'fiscal.device.json',
    artifactKind: 'tra_device',
    kvKey: 'vpos.device.data',
    dbTable: null,
  })
  assert.deepEqual(resolveFiscalTzArtifactTarget('fiscal.registration.json'), {
    fileName: 'fiscal.registration.json',
    artifactKind: 'tra_registration',
    kvKey: 'vpos.device.registration',
    dbTable: 'fiscal_registration',
  })
  assert.deepEqual(resolveFiscalTzArtifactTarget('fiscal.token.json'), {
    fileName: 'fiscal.token.json',
    artifactKind: 'tra_token',
    kvKey: 'vpos.tra.token',
    dbTable: null,
  })
})

test('wraps imported artifact KV values with source metadata', () => {
  const value = fiscalTzArtifactKvValue('fiscal.device.json', {
    version: 1,
    data: { zNum: '20260708', globalCounter: 12 },
    checksum: 'abc',
  })

  assert.equal(value.kind, 'tra_device')
  assert.equal(value.sourceFile, 'fiscal.device.json')
  assert.deepEqual(value.data, { zNum: '20260708', globalCounter: 12 })
  assert.equal(value.meta.version, 1)
  assert.equal(value.meta.checksum, 'abc')
  assert.match(value.importedAt, /^\d{4}-\d{2}-\d{2}T/)
})

test('extracts path-based legacy transaction queues as JSONB-safe payloads', () => {
  const items = extractFiscalTzQueueItems({
    stationId: 'station-1',
    fileName: 'fiscal.transaction.queue.json',
    kind: 'transaction',
    json: {
      version: 1,
      data: {
        transactions: [
          '/opt/fccapps/vpos-perm/vposfiscal/pending-transactions/txn.json',
        ],
      },
    },
  })

  assert.equal(items.length, 1)
  assert.equal(items[0]!.status, 'PENDING')
  assert.equal(items[0]!.retryCount, 0)
  assert.equal(items[0]!.payload.legacyPath, '/opt/fccapps/vpos-perm/vposfiscal/pending-transactions/txn.json')
  assert.equal(
    (items[0]!.payload._legacyFiscalTz as any).kind,
    'transaction',
  )
  assert.match(items[0]!.sourceKey, /vpos-fiscal-tz\|station-1\|/)
})

test('marks rotated old queue files as recovered failures for review', () => {
  const status = inferFiscalTzQueueStatus(
    'fiscal.transaction.queue.old_1.json',
  )

  assert.equal(status.status, 'FAILED')
  assert.equal(status.retryCount, 1)
  assert.match(status.lastError ?? '', /rotated legacy/i)

  const items = extractFiscalTzQueueItems({
    fileName: 'fiscal.report.queue.old_1.json',
    kind: 'report',
    json: { data: { reports: [{ znum: '20260708' }] } },
  })

  assert.equal(items[0]!.status, 'FAILED')
  assert.equal(items[0]!.retryCount, 1)
  assert.equal((items[0]!.payload as any).znum, '20260708')
})
