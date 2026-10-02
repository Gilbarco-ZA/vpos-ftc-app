import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const response = readFileSync('src/platform/web/api/response.ts', 'utf8')

test('recoverable PostgreSQL outages map to retryable 503 responses', () => {
  assert.match(response, /isRecoverablePostgresTransportError\(err\)/)
  assert.match(response, /code: 'SERVICE_UNAVAILABLE'/)
  assert.match(response, /status: 503/)
  assert.match(response, /'retry-after': '2'/)
})
