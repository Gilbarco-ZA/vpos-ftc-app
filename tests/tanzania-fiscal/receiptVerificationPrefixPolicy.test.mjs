import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(here, '../..')
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8')

test('Tanzania receipt prefix and verification URL selection are persisted and administered independently', () => {
  const prefixMigration = read(
    'scripts/migrations/postgres/1283_tanzania_receipt_verification_prefix.sql',
  )
  const settingsMigration = read(
    'scripts/migrations/postgres/1310_tanzania_receipt_verification_settings.sql',
  )
  const service = read(
    'src/modules/tanzania-fiscal/application/grossTotalOpening.ts',
  )
  const route = read(
    'app/api/admin/tanzania-fiscal/gross-total-opening/route.ts',
  )
  const client = read('components/admin/TanzaniaGrossTotalOpeningClient.tsx')
  const metadata = read(
    'src/modules/tanzania-fiscal/domain/proxyReceiptMetadata.ts',
  )
  const receiptCode = read(
    'src/modules/tanzania-fiscal/application/registeredReceiptCode.ts',
  )

  assert.match(
    prefixMigration,
    /tanzania_receipt_verification_prefix_mode VARCHAR\(16\)/,
  )
  assert.match(prefixMigration, /\^\[A-Z0-9\]\{6\}\$/)
  assert.match(settingsMigration, /SET tanzania_receipt_verification_prefix_mode = 'registered'/)
  assert.match(settingsMigration, /SET DEFAULT 'registered'/)
  assert.match(settingsMigration, /IN \('registered', 'manual'\)/)
  assert.match(settingsMigration, /tanzania_receipt_verification_url_mode/)
  assert.match(settingsMigration, /'development', 'production', 'manual'/)
  assert.match(service, /registeredReceiptCode/)
  assert.match(service, /tanzania_receipt_verification_prefix_mode/)
  assert.match(service, /tanzania_receipt_verification_prefix_override/)
  assert.match(service, /tanzania_receipt_verification_url_mode/)
  assert.match(service, /tanzania_receipt_verification_url_override/)
  assert.match(service, /effectiveReceiptVerificationPrefix/)
  assert.match(service, /effectiveReceiptVerificationUrlBase/)
  assert.match(route, /receiptVerificationPrefixMode/)
  assert.match(route, /receiptVerificationPrefixOverride/)
  assert.match(route, /receiptVerificationUrlMode/)
  assert.match(route, /receiptVerificationUrlOverride/)
  assert.match(route, /createAuditLog/)
  assert.match(client, /Registered TRA receiptCode/)
  assert.match(client, /Manual override/)
  assert.match(client, /Receipt verification URL environment/)
  assert.match(client, /<option value="development">Development<\/option>/)
  assert.match(client, /<option value="production">Production<\/option>/)
  assert.match(client, /<option value="manual">Manual URL<\/option>/)
  assert.match(client, /existing assignments retain their original prefix/i)
  assert.match(receiptCode, /\/api\/tanzania\/registrations\/tra\/status/)
  assert.match(metadata, /rctVerificationNum/)
  assert.match(metadata, /receiptVerificationNumber/)
})

test('Tanzania receipt settings migration drops the legacy prefix constraint before converting values to registered', () => {
  const settingsMigration = read(
    'scripts/migrations/postgres/1310_tanzania_receipt_verification_settings.sql',
  )

  const dropLegacyConstraintAt = settingsMigration.indexOf(
    'DROP CONSTRAINT IF EXISTS ck_station_settings_tanzania_receipt_prefix_mode',
  )
  const migrateLegacyValuesAt = settingsMigration.indexOf(
    "SET tanzania_receipt_verification_prefix_mode = 'registered'",
  )

  assert.notEqual(dropLegacyConstraintAt, -1)
  assert.notEqual(migrateLegacyValuesAt, -1)
  assert.ok(
    dropLegacyConstraintAt < migrateLegacyValuesAt,
    'legacy prefix mode constraint must be dropped before development/production values are converted to registered',
  )
})
