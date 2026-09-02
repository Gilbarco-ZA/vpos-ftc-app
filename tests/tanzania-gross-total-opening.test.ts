import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import { calculateTanzaniaGrossTotal } from '@/src/modules/tanzania-fiscal/domain/grossTotal'

test('Tanzania grossTotal carries forward the retired machine total', () => {
  assert.equal(calculateTanzaniaGrossTotal(12_500_000, 375_000.25), 12_875_000.25)
  assert.equal(calculateTanzaniaGrossTotal(0, 375_000.25), 375_000.25)
})

test('Tanzania grossTotal calculation rejects non-finite values', () => {
  assert.throws(
    () => calculateTanzaniaGrossTotal(Number.NaN, 10),
    /Opening gross total must be a finite number/,
  )
  assert.throws(
    () => calculateTanzaniaGrossTotal(10, Number.POSITIVE_INFINITY),
    /Local fiscal turnover must be a finite number/,
  )
})

test('Tanzania opening total is persisted, administered, and added during daily compilation', () => {
  const migration = readFileSync(
    'scripts/migrations/postgres/1271_tanzania_gross_total_opening.sql',
    'utf8',
  )
  const captureMigration = readFileSync(
    'scripts/migrations/postgres/1273_tanzania_gross_total_capture.sql',
    'utf8',
  )
  const deviceOverrideMigration = readFileSync(
    'scripts/migrations/postgres/1278_tanzania_device_id_override.sql',
    'utf8',
  )
  const receiptPrefixMigration = readFileSync(
    'scripts/migrations/postgres/1283_tanzania_receipt_verification_prefix.sql',
    'utf8',
  )
  const dailyTotals = readFileSync(
    'src/modules/tanzania-fiscal/infrastructure/proxyDailyTotals.ts',
    'utf8',
  )
  const route = readFileSync(
    'app/api/admin/tanzania-fiscal/gross-total-opening/route.ts',
    'utf8',
  )
  const service = readFileSync(
    'src/modules/tanzania-fiscal/application/grossTotalOpening.ts',
    'utf8',
  )
  const client = readFileSync(
    'components/admin/TanzaniaGrossTotalOpeningClient.tsx',
    'utf8',
  )
  const page = readFileSync(
    'app/(dashboard)/admin/tanzania-fiscal/page.tsx',
    'utf8',
  )

  assert.match(migration, /tanzania_gross_total_opening NUMERIC\(20, 2\)/)
  assert.match(migration, /tanzania_gross_total_opening >= 0/)
  assert.match(
    captureMigration,
    /tanzania_gross_total_opening_captured_at TIMESTAMPTZ/,
  )
  assert.match(captureMigration, /tanzania_gross_total_opening <> 0/)
  assert.match(
    deviceOverrideMigration,
    /tanzania_device_id_override VARCHAR\(191\)/,
  )
  assert.match(
    receiptPrefixMigration,
    /tanzania_receipt_verification_prefix_mode VARCHAR\(16\)/,
  )
  assert.match(receiptPrefixMigration, /'development', 'production', 'manual'/)
  assert.match(receiptPrefixMigration, /\^\[A-Z0-9\]\{6\}\$/)
  assert.match(dailyTotals, /calculateTanzaniaGrossTotal\(/)
  assert.match(dailyTotals, /ss\.tanzania_gross_total_opening/)
  assert.match(dailyTotals, /opening_gross_total_captured_at/)
  assert.match(dailyTotals, /has not been captured/)
  assert.match(route, /roles: \['administrator'\]/)
  assert.match(route, /createAuditLog/)
  assert.match(route, /openingGrossTotalCapturedAt/)
  assert.match(route, /setTanzaniaFiscalOpeningValues/)
  assert.match(route, /dailyCounter/)
  assert.match(route, /globalCounter/)
  assert.match(route, /deviceIdOverride/)
  assert.match(route, /receiptVerificationPrefixMode/)
  assert.match(route, /receiptVerificationPrefixOverride/)
  assert.match(service, /counter_key = 'receipt:global'/)
  assert.match(service, /'receipt:' \|\| TO_CHAR/)
  assert.match(service, /counter_value = EXCLUDED\.counter_value/)
  assert.match(service, /CURRENT_TIMESTAMP AT TIME ZONE/)
  assert.match(service, /tanzania_device_id_override/)
  assert.match(service, /tanzania_receipt_verification_prefix_mode/)
  assert.match(service, /effectiveReceiptVerificationPrefix/)
  assert.match(client, /label="Daily counter"/)
  assert.match(client, /label="Global counter"/)
  assert.match(client, /next invoice uses this value \+ 1/i)
  assert.match(client, /dailyCounterDirty \? \{ dailyCounter \} : \{\}/)
  assert.match(client, /globalCounterDirty \? \{ globalCounter \} : \{\}/)
  assert.match(client, /label="Device ID override"/)
  assert.match(client, /deviceIdOverrideDirty \? \{ deviceIdOverride \} : \{\}/)
  assert.match(client, /FTC does not send this value as deviceId or x-device-id/i)
  assert.match(client, /Development \(F1D845\)/)
  assert.match(client, /Production \(4BC37A\)/)
  assert.match(client, /Manual override/)
  assert.match(page, /TanzaniaGrossTotalOpeningClient/)
})
