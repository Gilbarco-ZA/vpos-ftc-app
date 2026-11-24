import assert from 'node:assert/strict'
import test from 'node:test'
import { VolatileDiagnostics } from '@/src/shared/logs/volatile-diagnostics'

test('diagnostics are bounded and isolated by station and filename', () => {
  const logs = new VolatileDiagnostics(2)
  logs.append('a', 'application.log', 'x'.repeat(12000), 10000)
  assert.equal(logs.get('a', 'application.log')?.data.length, 10000)
  logs.append('b', 'application.log', 'other', 10000)
  assert.equal(logs.get('b', 'application.log')?.data, 'other')
  logs.append('a', 'errors.log', 'failure', 10000)
  assert.equal(logs.get('a', 'application.log'), undefined)
  assert.equal(logs.list('a').length, 1)
  assert.equal(logs.clear('a', 'errors.log'), true)
  assert.equal(logs.list('a').length, 0)
})
