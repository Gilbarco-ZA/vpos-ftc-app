import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const role = readFileSync('components/transactions/FiscalizedTransactionsRolePage.tsx', 'utf8')
const admin = readFileSync('components/transactions/FiscalizedTransactionsPageClient.tsx', 'utf8')
const manager = readFileSync('components/transactions/FiscalizedTransactionsManagerClient.tsx', 'utf8')
const route = readFileSync('app/api/transactions/[id]/credit-note/route.ts', 'utf8')

test('Tanzania hides create credit note for administrators and managers', () => {
  assert.match(role, /getStationCountryCode\(user\.stationId\)/)
  assert.equal((role.match(/allowCreditNotes=\{!isTanzaniaCountry\(stationCountry\)\}/g) || []).length, 2)
  assert.match(admin, /\{allowCreditNotes && \(/)
  assert.match(manager, /\{props\.allowCreditNotes && \(/)
})

test('credit note POST rejects every non-Kenya station before issuing command', () => {
  assert.match(route, /getStationCountryCode\(user\.stationId\)/)
  assert.match(route, /country !== 'KE'/)
  assert.match(route, /Credit notes are currently supported only for Kenya stations/)
  assert.ok(route.indexOf("country !== 'KE'") < route.indexOf('const result = await createCreditNote'))
})
