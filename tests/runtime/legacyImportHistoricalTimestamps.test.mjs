import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const startupImporter = readFileSync(
  'src/modules/setup/infrastructure/legacy-importer/persistLegacyTransaction.ts',
  'utf8',
)
const cliImporter = readFileSync('scripts/import-legacy.mjs', 'utf8')

for (const [name, source] of [
  ['startup legacy importer', startupImporter],
  ['standalone legacy importer', cliImporter],
]) {
  test(`${name} preserves created_at from the successful historical fiscalization event`, () => {
    assert.match(source, /created_at = CASE\s+WHEN \$5 = 'SUCCESS' THEN COALESCE\(fiscalized_at, \$6::timestamptz\)\s+ELSE created_at\s+END/)
    assert.match(source, /fiscalized_at = CASE/)
    assert.match(source, /updated_at = NOW\(\)/)
  })
}
