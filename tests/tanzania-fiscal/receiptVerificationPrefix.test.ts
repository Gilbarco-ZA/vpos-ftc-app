import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildTanzaniaReceiptVerificationUrl,
  normalizeTanzaniaReceiptVerificationPrefixOverride,
  resolveTanzaniaReceiptVerificationPrefix,
} from '../../src/modules/tanzania-fiscal/domain/receiptVerificationPrefix'
import { extractTanzaniaProxyReceiptMetadata } from '../../src/modules/tanzania-fiscal/domain/proxyReceiptMetadata'

test('resolves the registered TRA receiptCode as the default prefix', () => {
  assert.equal(
    resolveTanzaniaReceiptVerificationPrefix({
      mode: 'registered',
      registeredReceiptCode: ' f1d845 ',
    }),
    'F1D845',
  )
  assert.equal(
    resolveTanzaniaReceiptVerificationPrefix({
      registeredReceiptCode: '4bc37a',
    }),
    '4BC37A',
  )
})

test('rejects registered prefix mode when TRA receiptCode is unavailable', () => {
  assert.throws(
    () => resolveTanzaniaReceiptVerificationPrefix({ mode: 'registered' }),
    /registered Tanzania receiptCode is unavailable/i,
  )
  assert.throws(
    () => resolveTanzaniaReceiptVerificationPrefix({}),
    /registered Tanzania receiptCode is unavailable/i,
  )
})

test('normalizes and resolves a manual Tanzania receipt prefix', () => {
  assert.equal(
    normalizeTanzaniaReceiptVerificationPrefixOverride(' ab12cd '),
    'AB12CD',
  )
  assert.equal(
    resolveTanzaniaReceiptVerificationPrefix({
      mode: 'manual',
      override: ' ab12cd ',
    }),
    'AB12CD',
  )
})

test('rejects missing or malformed manual receipt prefixes', () => {
  assert.throws(
    () => resolveTanzaniaReceiptVerificationPrefix({ mode: 'manual' }),
    /manual receipt verification prefix is required/i,
  )
  assert.throws(
    () =>
      resolveTanzaniaReceiptVerificationPrefix({
        mode: 'manual',
        override: 'ABC-12',
      }),
    /exactly 6 letters or numbers/i,
  )
})

test('extracts receipt values from a persisted Tanzania proxy request', () => {
  assert.deepEqual(
    extractTanzaniaProxyReceiptMetadata({
      documentNumber: 'INV-2026/09/01-05',
      tanzania: {
        invoiceNumber: 'INV-2026/09/01-05',
        rctVerificationNum: '4BC37A5',
        zNumber: '20260901',
        dailyCounter: 5,
        globalCounter: 5,
        invoiceDate: '2026-09-01T16:00:00+03:00',
      },
    }),
    {
      invoiceNumber: 'INV-2026/09/01-05',
      receiptVerificationNumber: '4BC37A5',
      zNumber: '20260901',
      dailyCounter: 5,
      globalCounter: 5,
      invoiceDate: '2026-09-01T16:00:00+03:00',
    },
  )
})

test('does not confuse invoice number with receipt verification number', () => {
  const metadata = extractTanzaniaProxyReceiptMetadata({
    tanzania: {
      invoiceNumber: 'INV-2026/09/01-05',
      rctVerificationNum: 'F1D8455',
    },
  })
  assert.equal(metadata?.invoiceNumber, 'INV-2026/09/01-05')
  assert.equal(metadata?.receiptVerificationNumber, 'F1D8455')
})

test('builds scannable TRA verification URLs independently of prefix source', () => {
  assert.equal(
    buildTanzaniaReceiptVerificationUrl({
      receiptVerificationNumber: 'F1D845335741',
      urlMode: 'development',
      invoiceDate: '2026-09-02T09:14:35+03:00',
    }),
    'https://virtual.tra.go.tz/efdmsRctVerify/F1D845335741_091435',
  )
  assert.equal(
    buildTanzaniaReceiptVerificationUrl({
      receiptVerificationNumber: '4BC37A335741',
      urlMode: 'production',
      invoiceDate: '2026-09-02T09:14:35+03:00',
    }),
    'https://verify.tra.go.tz/4BC37A335741_091435',
  )
  assert.equal(
    buildTanzaniaReceiptVerificationUrl({
      receiptVerificationNumber: 'ABC1239',
      urlMode: 'manual',
      urlOverride: 'https://example.test/tra-verify',
      invoiceDate: '2026-09-02T09:14:35+03:00',
    }),
    'https://example.test/tra-verify/ABC1239_091435',
  )
})
