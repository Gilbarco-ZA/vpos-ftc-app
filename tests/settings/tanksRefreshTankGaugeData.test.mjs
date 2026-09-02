import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'

const root = process.cwd()
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8')

test('/tanks Refresh Tank Gauge Data persists ATG data, refreshes levels, and publishes the same capture', () => {
  const client = read('components/tanks/TankConfigClient.tsx')
  const settingsClient = read('app/(dashboard)/settings/tanks/client.tsx')
  const sync = read('src/modules/settings/application/syncTankVolumes.ts')
  const route = read('app/api/settings/tanks/sync-volumes/route.ts')
  const capture = read('src/modules/forecourt/application/captureAtgSnapshot.ts')

  assert.match(client, /fetch\('\/api\/settings\/tanks\/sync-volumes'/)
  assert.match(client, /method: 'POST'/)
  assert.match(client, /publishTanzaniaInventory: true/)
  assert.doesNotMatch(settingsClient, /publishTanzaniaInventory/)
  assert.match(client, /sent \$\{published\} tank inventory record\(s\) to vpos-proxy/)
  assert.match(route, /body\.publishTanzaniaInventory !== true/)
  assert.match(route, /publishTanzaniaTankInventoriesForCapture\(/)
  assert.match(route, /user\.stationId,\s*result\.capture/)
  assert.match(client, /setConfig\(normalizeTankConfig\(data\.config\)\)/)
  assert.match(client, /setTgData\(\{ success: true, data: data\.liveData \?\? \{\} \}\)/)
  assert.match(sync, /tankIndexFromGaugeId/)
  assert.match(sync, /tankLevels\[index\] = gross/)
  assert.match(sync, /saveTankConfig\(stationId, config\)/)
  assert.match(sync, /recordedAt: result\.recordedAt/)
  assert.match(sync, /snapshotsSaved: Number\(result\.snapshotsSaved \?\? 0\)/)
  assert.match(capture, /liveData:/)
  assert.match(capture, /responses,/)
  assert.match(capture, /normalized,/)
})
