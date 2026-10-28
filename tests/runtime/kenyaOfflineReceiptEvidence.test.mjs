import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const builder = readFileSync('src/modules/transactions/infrastructure/fiscalization/receiptBuilder.ts', 'utf8')
const kenya = readFileSync('src/shared/fiscalization/receipt/templates/KE.ts', 'utf8')
const snapshot = readFileSync('src/shared/receipts/receiptSnapshots.ts', 'utf8')

test('Kenya offline receipts derive evidence from stable transaction timestamp and configured PIN and branch', () => {
  assert.match(builder, /generateKenyaOfflineEvidence\(/)
  assert.match(builder, /invoiceNumber: offlineStamp/)
  assert.match(builder, /issuedAt: offlineIssuedAt/)
  assert.match(builder, /offlineQrPrefix \+ kenyaSite!\.value\.tin \+ kenyaSite!\.value\.branchId \+ kenyaOffline\.receiptSignature/)
  assert.match(builder, /kenyaOffline\?\.receiptInternalData/)
  assert.match(builder, /kenyaOffline\?\.receiptSignature/)
})
test('Kenya printable receipts remain visibly pending and have normalized date plus QR', () => {
  assert.match(kenya, /PENDING FISCALIZATION/)
  assert.match(kenya, /const parsed = new Date\(raw\)/)
  assert.match(kenya, /lines\.push\(\{ type: 'qr', value: url \}\)/)
  assert.match(snapshot, /model\.fiscalMeta\.internalData/)
  assert.match(snapshot, /model\.fiscalMeta\.signature/)
})
