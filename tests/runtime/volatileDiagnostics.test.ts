import assert from 'node:assert/strict'
import test from 'node:test'
import { isVolatileDiagnostic, VolatileDiagnostics } from '@/src/shared/logs/volatile-diagnostics'

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

test('managed JPL traffic is volatile only for the exact live diagnostic name', () => {
  const previous = process.env.VPOS_MANAGED_BY_START_SH
  try {
    process.env.VPOS_MANAGED_BY_START_SH = '1'
    for (const filename of ['application.log', 'application-errors.log', 'errors.log', 'doms-jpl.log']) {
      assert.equal(isVolatileDiagnostic('live', filename), true)
    }
    for (const type of ['archive', 'restart']) {
      assert.equal(isVolatileDiagnostic(type, 'doms-jpl.log'), false)
    }
    assert.equal(isVolatileDiagnostic('live', 'audit.log'), false)
    assert.equal(isVolatileDiagnostic('live', '../doms-jpl.log'), false)
    for (const flag of ['0', 'true', undefined]) {
      if (flag === undefined) delete process.env.VPOS_MANAGED_BY_START_SH
      else process.env.VPOS_MANAGED_BY_START_SH = flag
      assert.equal(isVolatileDiagnostic('live', 'doms-jpl.log'), false)
    }
  } finally {
    if (previous === undefined) delete process.env.VPOS_MANAGED_BY_START_SH
    else process.env.VPOS_MANAGED_BY_START_SH = previous
  }
})

test('JPL diagnostics retain bounded live content and participate in list and clear', () => {
  const logs = new VolatileDiagnostics()
  logs.append('station-a', 'doms-jpl.log', 'x'.repeat(12000), 10000)
  logs.append('station-a', 'doms-jpl.log', 'latest event', 10000)
  logs.append('station-b', 'doms-jpl.log', 'other station', 10000)
  assert.equal(logs.get('station-a', 'doms-jpl.log')?.data.length, 10000)
  assert.ok(logs.get('station-a', 'doms-jpl.log')?.data.endsWith('latest event'))
  assert.equal(logs.list('station-a')[0]?.filename, 'doms-jpl.log')
  assert.equal(logs.clear('station-a', 'doms-jpl.log'), true)
  assert.deepEqual(logs.list('station-a'), [])
  assert.equal(logs.get('station-b', 'doms-jpl.log')?.data, 'other station')
})
