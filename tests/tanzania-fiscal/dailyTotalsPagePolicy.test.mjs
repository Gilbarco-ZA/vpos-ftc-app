import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const read = (path) => readFileSync(path, 'utf8')

test('Tanzania daily totals page is country-scoped and navigation is hidden elsewhere', () => {
  const page = read('app/(dashboard)/tanzania/daily-totals/page.tsx')
  const sidebar = read('components/layout/sidebar.tsx')

  assert.match(page, /getStationCountryCode\(user\.stationId\)/)
  assert.match(page, /if \(!isTanzaniaCountry\(country\)\) redirect\('\/reports'\)/)
  assert.match(sidebar, /isTanzaniaCountry\(stationCountry\)[\s\S]*Daily Totals/)
  assert.match(sidebar, /href: '\/tanzania\/daily-totals'/)
})

test('daily totals worker gates automatic creation by station-local schedule while manual force-send stays explicit', () => {
  const worker = read(
    'src/modules/tanzania-fiscal/infrastructure/proxyDailyTotalsWorker.ts',
  )
  const route = read('app/api/tanzania/daily-totals/route.ts')
  const migration = read(
    'scripts/migrations/postgres/1279_tanzania_daily_totals_schedule.sql',
  )

  assert.match(worker, /isTanzaniaDailyTotalsSendTimeReached/)
  assert.match(worker, /reason: 'scheduled_time_not_reached'/)
  assert.match(worker, /forceSendTanzaniaDailyTotal/)
  assert.match(worker, /status NOT IN \('SENDING', 'QUEUED'\)/)
  assert.match(route, /action === 'force-send'/)
  assert.match(route, /roles: \['administrator'\]/)
  assert.match(migration, /DEFAULT TIME '00:00:00'/)
})

test('daily totals page provides stored history and print controls', () => {
  const client = read('components/tanzania/TanzaniaDailyTotalsClient.tsx')
  const store = read(
    'src/modules/tanzania-fiscal/infrastructure/dailyTotalsStore.ts',
  )

  assert.match(client, /Submission history/)
  assert.match(client, /window\.print\(\)/)
  assert.match(client, /PrintableReport/)
  assert.match(client, /Physical tank inventory/)
  assert.match(client, /Tank groups are not aggregated/)
  assert.match(store, /FROM tanzania_daily_total_submissions/)
  assert.match(store, /ORDER BY business_date DESC/)
})
