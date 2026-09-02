import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8')

test('transaction and receipt pages default through the station business date', () => {
  const receipts = read('components/receipts/ReceiptsRolePage.tsx')
  const fiscalized = read(
    'components/transactions/FiscalizedTransactionsRolePage.tsx',
  )
  const nonFiscalized = read(
    'components/transactions/NonFiscalizedTransactionsRolePage.tsx',
  )

  for (const source of [receipts, fiscalized, nonFiscalized]) {
    assert.match(source, /getStationCurrentBusinessDate/)
    assert.match(source, /resolveDateFilter/)
  }
})

test('date-only transaction filters use the configured station timezone', () => {
  const api = read('app/api/transactions/route.ts')
  const sql = read(
    'src/modules/transactions/infrastructure/persistence/transaction.sql.ts',
  )

  assert.match(api, /startDate: searchParams\.get\('startDate'\)/)
  assert.match(api, /endDate: searchParams\.get\('endDate'\)/)
  assert.match(sql, /NULLIF\(BTRIM\(fs\.timezone\), ''\)/)
  assert.match(sql, /AT TIME ZONE/)
  assert.match(sql, /::date \+ 1/)
  assert.match(sql, /transaction_date_time </)
})

test('receipt and transaction filters retain an explicit all-dates choice', () => {
  const toolbar = read('components/crud/ListToolbar.tsx')
  const receipts = read('components/receipts/ReceiptViewerClient.tsx')
  const resolver = read('src/shared/crud/dateFilters.ts')

  assert.match(toolbar, /value="all">All dates/)
  assert.match(toolbar, /baseQueryEntries\.map/)
  assert.match(receipts, />\s*All dates\s*</)
  assert.match(resolver, /requestedPreset === 'all'/)
  assert.match(resolver, /startDate: today, endDate: today, preset: 'today'/)
})
