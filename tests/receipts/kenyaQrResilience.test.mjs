import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

test('offline Kenya QR takes precedence over stale template QR', () => {
  const builder = readFileSync('src/modules/transactions/infrastructure/fiscalization/receiptBuilder.ts', 'utf8')
  assert.match(builder, /kenyaOfflineEligible \? offlineQrUrl : null/)
  assert.match(builder, /const kenyaVerificationUrl/)
  assert.match(builder, /qrPayload: stationCountry === 'KE'/)
  assert.match(builder, /verificationUrl: kenyaVerificationUrl/)
})

test('Kenya normalization prefers valid HTTPS model URL', () => {
  const normalized = readFileSync('src/shared/receipts/normalizeReceipt.ts', 'utf8')
  assert.match(normalized, /receiptModel\?\.qrPayload\?\.verificationUrl/)
  assert.match(normalized, /\.find\(value => \/\^https:/)
})

test('pending Kenya receipt with missing saved QR may be regenerated', () => {
  const preview = readFileSync('src/modules/transactions/infrastructure/fiscalization/preFiscalizationReceipt.ts', 'utf8')
  assert.match(preview, /const missingQr/)
  assert.match(preview, /canRecoverQr/)
  assert.match(preview, /state\?\.fiscalized_at/)
})
