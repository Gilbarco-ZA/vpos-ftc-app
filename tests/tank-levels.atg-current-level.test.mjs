import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

const read = (path) => fs.readFileSync(path, 'utf8')

test('/tank-levels current level prefers persisted ATG volume over accounting baselines', () => {
  const repo = read('src/modules/tank-levels/infrastructure/tankLevelsRepo.ts')
  const client = read('components/tank-levels/TankLevelsPageClient.tsx')

  assert.match(
    repo,
    /COALESCE\(\s*t\.live_volume_litres,\s*COALESCE\(\s*tm\.stock_count_litres,\s*t\.manual_volume_litres,\s*0\s*\) \+ COALESCE\(tm\.movement_balance_litres, 0\)\s*\) AS current_volume_litres/,
  )
  assert.match(
    repo,
    /COALESCE\(t\.live_volume_litres, t\.manual_volume_litres, 0\) AS current_volume_litres/,
  )
  assert.match(client, /tank\.liveVolumeLitres !== null\s*\? 'Live ATG'/)
  assert.match(client, /formatDateTime\(tank\.liveVolumeUpdatedAt\)/)
})
