import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const store = readFileSync('src/modules/fiscalization/countries/kenya/siteConfiguration.ts', 'utf8')
const receipt = readFileSync('src/modules/transactions/infrastructure/fiscalization/receiptBuilder.ts', 'utf8')
const api = readFileSync('app/api/admin/kenya-fiscal/site/route.ts', 'utf8')
const sidebar = readFileSync('components/layout/sidebar.tsx', 'utf8')

test('Kenya fiscal fetch requires matching country before writing station-scoped configuration', () => {
  assert.match(store, /country !== 'KE'/)
  assert.match(store, /countryCode.*'KE'/)
  assert.match(store, /kenya\.fiscal\.site\.configuration/)
  assert.match(store, /ON CONFLICT \(station_id, key\)/)
  assert.match(store, /Number\.isSafeInteger/)
  assert.match(api, /defineMutationRoute/)
})

test('Kenya fiscal setup is in navigation and cached device values support receipt rendering', () => {
  assert.match(sidebar, /Kenya Fiscal/)
  assert.match(receipt, /kenya\.fiscal\.site\.configuration/)
  assert.match(receipt, /kenyaSite\?\.value\?\.sdcId/)
  assert.match(receipt, /kenyaSite\?\.value\?\.tin/)
})
