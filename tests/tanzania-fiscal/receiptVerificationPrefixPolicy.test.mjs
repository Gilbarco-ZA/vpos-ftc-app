import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(here, '../..')
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8')

test('Tanzania receipt prefix selection is persisted and administered', () => {
  const migration = read(
    'scripts/migrations/postgres/1283_tanzania_receipt_verification_prefix.sql',
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

  assert.match(
    migration,
    /tanzania_receipt_verification_prefix_mode VARCHAR\(16\)/,
  )
  assert.match(migration, /DEFAULT 'development'/)
  assert.match(migration, /'development', 'production', 'manual'/)
  assert.match(migration, /\^\[A-Z0-9\]\{6\}\$/)
  assert.match(service, /tanzania_receipt_verification_prefix_mode/)
  assert.match(service, /tanzania_receipt_verification_prefix_override/)
  assert.match(service, /effectiveReceiptVerificationPrefix/)
  assert.match(route, /receiptVerificationPrefixMode/)
  assert.match(route, /receiptVerificationPrefixOverride/)
  assert.match(route, /createAuditLog/)
  assert.match(client, /Development \(F1D845\)/)
  assert.match(client, /Production \(4BC37A\)/)
  assert.match(client, /Manual override/)
  assert.match(client, /existing assignments retain their original prefix/i)
  assert.match(metadata, /rctVerificationNum/)
  assert.match(metadata, /receiptVerificationNumber/)
})
