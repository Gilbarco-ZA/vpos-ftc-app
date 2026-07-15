import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

test('legacy import completes before forecourt WebSocket and JPL startup', async () => {
  const source = await readFile('server.ts', 'utf8')

  const importIndex = source.indexOf('await runStartupImport(stationId)')
  const websocketIndex = source.indexOf('attachForecourtWs(server)')
  const runtimeIndex = source.indexOf('runtime = startLocalServerRuntime(stationId)')

  assert.notEqual(importIndex, -1, 'startup import call must exist')
  assert.notEqual(websocketIndex, -1, 'forecourt WebSocket startup must exist')
  assert.notEqual(runtimeIndex, -1, 'local runtime startup must exist')
  assert.ok(
    importIndex < websocketIndex,
    'forecourt WebSocket/JPL startup must occur after legacy import',
  )
  assert.ok(
    websocketIndex < runtimeIndex,
    'runtime workers must start after the forecourt layer is attached',
  )
})
