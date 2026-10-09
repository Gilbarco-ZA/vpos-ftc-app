import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const read = (path) => readFileSync(path, 'utf8')

test('Tanzania daily totals retrieves true server pages and opens a right-side report sheet', () => {
  const ui = read('components/tanzania/TanzaniaDailyTotalsClient.tsx')
  const route = read('app/api/tanzania/daily-totals/route.ts')
  const app = read('src/modules/tanzania-fiscal/application/dailyTotalsAdmin.ts')
  const store = read('src/modules/tanzania-fiscal/infrastructure/dailyTotalsStore.ts')
  assert.match(ui, /SheetContent side="right"/)
  assert.match(ui, /setSelectedId\(item.id\)/)
  assert.match(ui, /pageSize/)
  assert.match(ui, /data\.total/)
  assert.match(route, /params\.get\('page'\)/)
  assert.match(route, /params\.get\('pageSize'\)/)
  assert.match(app, /COUNT\(\*\)::text AS total/)
  assert.match(store, /LIMIT \$2 OFFSET \$3/)
})

test('Reports preview pages API transactions and filters before paging', () => {
  const ui = read('components/reports/ManagerReportsClient.tsx')
  assert.match(ui, /page: String\(page\), pageSize: String\(pageSize\)/)
  assert.match(ui, /transactionParams\.set\('pumpNumber'/)
  assert.match(ui, /transactionParams\.set\('status'/)
  assert.match(ui, /transactionPayload\?\.total/)
  assert.match(ui, /reports-page-size/)
  assert.doesNotMatch(ui, /transactionRows\.slice\(0, 50\)/)
})

test('Non-fiscalized administrator and manager use paged source data', () => {
  const server = read('components/transactions/NonFiscalizedTransactionsRolePage.tsx')
  const client = read('components/transactions/NonFiscalizedTransactionsPageClient.tsx')
  assert.match(server, /scope: 'non-fiscalized',\s+page,\s+pageSize/)
  assert.match(server, /initialTotal=\{total\}/)
  assert.match(server, /manager-non-fiscalized-size/)
  assert.match(client, /page: String\(page\)/)
  assert.match(client, /pageSize: String\(pageSize\)/)
  assert.match(client, /payload\?\.total/)
  assert.match(client, /non-fiscalized-page-size/)
})
