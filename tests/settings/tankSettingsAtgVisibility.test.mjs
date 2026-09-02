import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'

const root = process.cwd()
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8')

test('/settings/tanks exposes persisted ATG values after manual DOMS sync', () => {
  const repo = read('src/modules/settings/infrastructure/settingsRepo.ts')
  const app = read('src/modules/settings/application/getTankSettings.ts')
  const client = read('app/(dashboard)/settings/tanks/client.tsx')

  assert.match(repo, /LEFT JOIN tank_atg_snapshots atg/)
  assert.match(repo, /atg\.product_level AS atg_product_level/)
  assert.match(repo, /atg\.water_volume_litres AS atg_water_volume_litres/)
  assert.match(app, /atgProductLevelMm/)
  assert.match(app, /atgWaterVolumeLitres/)
  assert.match(client, /<TableHead>Live ATG<\/TableHead>/)
  assert.match(client, /Live DOMS \/ ATG inventory/)
  assert.match(client, /formatMeasurement\(tank\.liveVolumeLitres\)/)
  assert.match(client, /configured capacity and manual volume are not overwritten/)
})
