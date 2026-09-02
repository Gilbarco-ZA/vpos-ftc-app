import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const firstBoot = readFileSync('src/platform/bootstrap/first-boot.ts', 'utf8')
const migrations = readFileSync(
  'src/platform/bootstrap/postgres-migrations.ts',
  'utf8',
)
const databaseBootstrap = readFileSync(
  'src/platform/db/postgres/database-bootstrap.ts',
  'utf8',
)

test('bootstrap phases are process-global single-flight operations', () => {
  assert.match(firstBoot, /__vposFirstBootPromise/)
  assert.match(firstBoot, /globalThis as FirstBootGlobals/)
  assert.doesNotMatch(firstBoot, /let firstBootPromise:/)

  assert.match(migrations, /__vposPostgresMigrationsPromise/)
  assert.match(migrations, /globalThis as MigrationGlobals/)
  assert.doesNotMatch(migrations, /let migrationsPromise:/)

  assert.match(databaseBootstrap, /__vposDatabaseBootstrapPromise/)
  assert.match(databaseBootstrap, /globalThis as DatabaseBootstrapGlobals/)
  assert.doesNotMatch(databaseBootstrap, /let databaseBootstrapPromise:/)
})

test('failed bootstrap attempts clear their global promise for an explicit retry', () => {
  assert.match(firstBoot, /__vposFirstBootPromise = undefined/)
  assert.match(migrations, /__vposPostgresMigrationsPromise = undefined/)
  assert.match(databaseBootstrap, /__vposDatabaseBootstrapPromise = undefined/)
})
