import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'

const root = process.cwd()
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8')

test('runtime timezone selection uses Site Profile or device local timezone', () => {
  const resolver = read('src/shared/time/localTimezone.ts')
  const core = read('src/shared/time/timezoneCore.ts')
  const projection = read('src/shared/time/localDateTime.ts')
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
  assert.match(resolver, /resolveStationTimezone/)
  assert.match(resolver, /resolveStationTimezoneContext/)
  assert.match(resolver, /from '@\/src\/shared\/time\/timezoneCore'/)
  assert.doesNotMatch(resolver, /Africa\/[A-Za-z_]+/)

  assert.match(core, /Intl\.DateTimeFormat\(\)\.resolvedOptions\(\)\.timeZone/)
  assert.match(core, /export function resolveLocalTimezone/)
  assert.doesNotMatch(core, /stationKv|postgres|KV_KEYS/)

  assert.match(projection, /export function localDateTime/)
  assert.match(projection, /from '@\/src\/shared\/time\/timezoneCore'/)
  assert.doesNotMatch(projection, /from '@\/src\/shared\/time\/localTimezone'/)
  assert.doesNotMatch(projection, /stationKv|postgres|KV_KEYS/)
  assert.match(projection, /resolveLocalTimezone\(timezone\)/)
  assert.match(projection, /displayDate/)
  assert.match(projection, /compactDate/)
  assert.match(projection, /timeMinutes/)
  assert.match(projection, /localIso/)

  assert.match(bootstrap, /deviceLocalTimezone\(\)/)
  assert.doesNotMatch(bootstrap, /Africa\/[A-Za-z_]+/)

  assert.match(envDefaults, /DEFAULT_STATION_TIMEZONE:\s*''/)
  assert.doesNotMatch(envDefaults, /DEFAULT_STATION_TIMEZONE:\s*'Africa\//)

  assert.match(businessDate, /resolveStationTimezone\(stationId\)/)
  assert.match(businessDate, /localDateTime\(new Date\(\), timezone\)\.isoDate/)
  assert.doesNotMatch(businessDate, /Intl\.DateTimeFormat/)

  assert.match(dailyTotals, /resolveStationTimezone\(stationId\)/)
  assert.doesNotMatch(dailyTotals, /Africa\/Dar_es_Salaam/)

  assert.match(fiscalTimezone, /resolveStationTimezone\(stationId\)/)
  assert.doesNotMatch(fiscalTimezone, /Africa\/Dar_es_Salaam/)
})

test('dashboard clock uses the effective server-resolved timezone and shared time projection', () => {
  const dashboardPage = read('app/(dashboard)/dashboard/page.tsx')
  const dashboardHome = read('components/dashboard/RoleDashboardHome.tsx')
  const clock = read('components/dashboard/FiscalClock.tsx')

  assert.match(dashboardPage, /resolveStationTimezoneContext\(user\.stationId\)/)
  assert.match(dashboardPage, /timezone=\{timezoneContext\.timezone\}/)
  assert.match(dashboardPage, /timezoneSource=\{timezoneContext\.source\}/)

  assert.match(dashboardHome, /<FiscalClock timezone=\{timezone\} source=\{timezoneSource\} \/>/)
  assert.match(clock, /localDateTime\(now, timezone\)/)
  assert.doesNotMatch(clock, /Intl\.DateTimeFormat/)
  assert.match(clock, /Receipt & report time/)
  assert.match(clock, /receipts, reports, and fiscal[\s\S]*business-date calculations/)
  assert.match(clock, /href="\/admin\/setup"/)
})

test('fiscal and receipt formatting delegate to the shared local time projection', () => {
  const fiscalXml = read('src/modules/tanzania-fiscal/infrastructure/xml.ts')
  const receiptDisplay = read('src/shared/receipts/receiptDateTimeDisplay.ts')
  const schedule = read('src/modules/tanzania-fiscal/domain/dailyTotalsSchedule.ts')
  const grossTotal = read(
    'src/modules/tanzania-fiscal/application/grossTotalOpening.ts',
  )
  const zReport = read(
    'src/modules/tanzania-fiscal/infrastructure/traZReport.ts',
  )

  assert.match(fiscalXml, /localDateTime\(value, timezone\)/)
  assert.doesNotMatch(fiscalXml, /Intl\.DateTimeFormat/)

  assert.match(receiptDisplay, /localDateTime\(input, timezone\)/)
  assert.doesNotMatch(receiptDisplay, /getUTC(?:Date|Month|FullYear|Hours|Minutes|Seconds)/)

  assert.match(schedule, /localDateTime\(args\.now, args\.timezone\)\.timeMinutes/)
  assert.doesNotMatch(schedule, /Intl\.DateTimeFormat/)

  assert.match(grossTotal, /localDateTime\(new Date\(\), timezone\)/)
  assert.doesNotMatch(grossTotal, /Africa\/Dar_es_Salaam/)
  assert.doesNotMatch(grossTotal, /CURRENT_TIMESTAMP AT TIME ZONE/)

  assert.match(zReport, /resolveTanzaniaFiscalTimezone\(args\.stationId\)/)
  assert.doesNotMatch(zReport, /Africa\/Dar_es_Salaam/)
})
