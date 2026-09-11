import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'

const root = process.cwd()
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8')

test('runtime timezone selection uses Site Profile or device local timezone', () => {
  const resolver = read('src/shared/time/localTimezone.ts')
  const bootstrap = read('src/platform/bootstrap/first-boot.ts')
  const envDefaults = read('src/platform/runtime/env-defaults.cjs')
  const businessDate = read('src/shared/server/stationBusinessDate.ts')
  const dailyTotals = read(
    'src/modules/tanzania-fiscal/infrastructure/dailyTotalsStore.ts',
  )
  const fiscalTimezone = read(
    'src/modules/tanzania-fiscal/infrastructure/timezone.ts',
  )

  assert.match(resolver, /KV_KEYS\.SITE_PROFILE/)
  assert.match(
    resolver,
    /Intl\.DateTimeFormat\(\)\.resolvedOptions\(\)\.timeZone/,
  )
  assert.match(resolver, /resolveStationTimezone/)
  assert.doesNotMatch(resolver, /Africa\/[A-Za-z_]+/)

  assert.match(bootstrap, /deviceLocalTimezone\(\)/)
  assert.doesNotMatch(bootstrap, /Africa\/[A-Za-z_]+/)

  assert.match(envDefaults, /DEFAULT_STATION_TIMEZONE:\s*''/)
  assert.doesNotMatch(envDefaults, /DEFAULT_STATION_TIMEZONE:\s*'Africa\//)

  assert.match(businessDate, /resolveStationTimezone\(stationId\)/)
  assert.doesNotMatch(businessDate, /AT TIME ZONE[^\n]*'UTC'/)

  assert.match(dailyTotals, /resolveStationTimezone\(stationId\)/)
  assert.doesNotMatch(dailyTotals, /Africa\/Dar_es_Salaam/)

  assert.match(fiscalTimezone, /resolveStationTimezone\(stationId\)/)
  assert.doesNotMatch(fiscalTimezone, /Africa\/Dar_es_Salaam/)
})
