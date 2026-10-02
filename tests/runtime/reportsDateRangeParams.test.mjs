import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const reportsClient = readFileSync(
  'components/reports/ManagerReportsClient.tsx',
  'utf8',
)

test('reports use endpoint-specific date range parameter names', () => {
  assert.match(reportsClient, /summaryParams[\s\S]*fromKey: 'start', toKey: 'end'/)
  assert.match(reportsClient, /transactionParams[\s\S]*applyDateRangeParams\(transactionParams, \{ startDate, endDate \}\)/)
  assert.match(reportsClient, /\/api\/transactions\?\$\{transactionParams\.toString\(\)\}/)
})
