import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const core = readFileSync('src/platform/db/postgres/core.ts', 'utf8')
const errors = readFileSync('src/platform/db/postgres/errors.ts', 'utf8')

test('transient PostgreSQL transport errors are classified centrally', () => {
  assert.match(errors, /isRecoverablePostgresTransportError/)
  assert.match(errors, /connection terminated unexpectedly/i)
  assert.match(errors, /ECONNRESET/)
})

test('only read-only SELECT queries receive a bounded transport retry', () => {
  assert.match(core, /const isReadOnlyQuery = \(text: string\) => \^\\s\*SELECT\\b/i)
  assert.match(core, /isReadOnlyQuery\(text\)[\s\S]*isRecoverablePostgresTransportError\(err\)/)
  assert.match(core, /await sleep\(150\)/)
  assert.match(core, /retrying read after transient transport failure/)
})
