import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const repository = readFileSync(
  'src/modules/transactions/infrastructure/persistence/transaction-list-with-receipts.repository.ts',
  'utf8',
)
const migration = readFileSync(
  'scripts/migrations/postgres/1340_reporting_read_path_indexes.sql',
  'utf8',
)
const fiscalizedBrowseMigration = readFileSync(
  'scripts/migrations/postgres/1341_fiscalized_reporting_browse_indexes.sql',
  'utf8',
)
const receiptBrowseMigration = readFileSync(
  'scripts/migrations/postgres/1342_receipt_browse_index.sql',
  'utf8',
)

test('reporting reads prefer the transaction latest fiscal event pointer', () => {
  assert.match(repository, /LEFT JOIN fiscalization_events latest_fe/)
  assert.match(repository, /latest_fe\.id = t\.latest_fiscal_event_id/)
  assert.match(repository, /FROM fiscalization_events fe/)
})

test('reporting pagination counts skip receipt joins unless search needs them', () => {
  assert.match(
    repository,
    /const countFromSql = hasSearch \? fromSql : 'FROM transactions t'/,
  )
})

test('non-search report previews limit transactions before receipt enrichment', () => {
  assert.match(repository, /FROM \([\s\S]*FROM transactions t[\s\S]*LIMIT \$\{limitParam\}[\s\S]*\) t/)
  assert.match(repository, /: 't\.\*'/)
  assert.match(repository, /if \(!hasSearch\)/)
  assert.match(repository, /const limitParam = `\$\$\{params\.length \+ 1\}`/)
})

test('reporting migration covers station date scans and latest receipt lookup', () => {
  assert.match(
    migration,
    /ON transactions \(station_id, transaction_date_time DESC\)/,
  )
  assert.match(
    migration,
    /ON receipts \(station_id, transaction_id, generated_at DESC\)/,
  )
})

test('fiscalized report browsing has dedicated indexes for all-date and date-range reads', () => {
  assert.match(
    fiscalizedBrowseMigration,
    /idx_transactions_station_fiscalized_browse_active/,
  )
  assert.match(
    fiscalizedBrowseMigration,
    /station_id,\s*fiscalized_at DESC NULLS LAST,\s*transaction_date_time DESC/,
  )
  assert.match(
    fiscalizedBrowseMigration,
    /idx_transactions_station_date_fiscalized_browse_active/,
  )
  assert.match(
    fiscalizedBrowseMigration,
    /station_id,\s*transaction_date_time DESC,\s*fiscalized_at DESC NULLS LAST/,
  )
  assert.match(
    fiscalizedBrowseMigration,
    /fiscalized_at IS NOT NULL[\s\S]*UPPER\(COALESCE\(status, ''\)\) = 'FISCALIZED'/,
  )
  assert.doesNotMatch(
    fiscalizedBrowseMigration,
    /idx_receipts_station_generated_desc/,
  )
})

test('receipt browsing has its own station newest-first index migration', () => {
  assert.match(receiptBrowseMigration, /idx_receipts_station_generated_desc/)
  assert.match(
    receiptBrowseMigration,
    /ON receipts \(station_id, generated_at DESC\)/,
  )
})

test('scope=fiscalized uses fiscalized_at directly so the partial index remains usable', () => {
  assert.match(
    repository,
    /scope === 'fiscalized'[\s\S]*conditions\.push\(\s*`t\.fiscalized_at IS NOT NULL`/,
  )
  assert.doesNotMatch(
    repository,
    /scope === 'fiscalized'[\s\S]{0,250}fiscalized_at IS NOT NULL OR/,
  )
})

test('receipt viewer lists receipts directly instead of routing through transaction listing', () => {
  const viewer = readFileSync(
    'components/receipts/ReceiptViewerClient.tsx',
    'utf8',
  )
  const receiptQuery = readFileSync(
    'src/modules/transactions/application/queries/get-receipt-route-data.ts',
    'utf8',
  )

  assert.match(viewer, /fetch\(\`\/api\/receipts\?\$\{params\.toString\(\)\}\`/)
  assert.doesNotMatch(
    viewer,
    /fetch\(\`\/api\/transactions\?\$\{params\.toString\(\)\}\`/,
  )
  assert.match(receiptQuery, /FROM receipts r/)
  assert.match(receiptQuery, /JOIN transactions t/)
})

test('fiscalized transaction pages keep search and date filters in the server query', () => {
  const rolePage = readFileSync(
    'components/transactions/FiscalizedTransactionsRolePage.tsx',
    'utf8',
  )
  const client = readFileSync(
    'components/transactions/FiscalizedTransactionsPageClient.tsx',
    'utf8',
  )

  assert.match(rolePage, /const q = readParam\(searchParams, 'q'\)\.trim\(\)/)
  assert.match(rolePage, /scope: 'fiscalized'/)
  assert.match(rolePage, /search: q \|\| undefined/)
  assert.match(rolePage, /pageSize,/)
  assert.match(rolePage, /\[10, 25, 50, 100\]/)
  assert.match(rolePage, /initialPageSize=\{pageSize\}/)
  assert.match(rolePage, /initialSearch=\{q\}/)
  assert.match(client, /useState\(initialSearch\)/)
  assert.match(
    client,
    /scope: 'fiscalized',[\s\S]*page: String\(page\),[\s\S]*pageSize: String\(pageSize\)/,
  )
  assert.match(client, /params\.set\('search', search\.trim\(\)\)/)
  assert.match(client, /params\.set\('startDate', startDate\)/)
  assert.match(client, /params\.set\('endDate', endDate\)/)
  assert.match(client, /setTotal\(Number\(payload\?\.total/)
})

test('exact transaction status filters use index-friendly equality predicates', () => {
  assert.match(repository, /conditions\.push\(`t\.status = \$\{addParam\(status\)\}`\)/)
  assert.doesNotMatch(
    repository,
    /UPPER\(COALESCE\(t\.status, ''\)\) = \$\{addParam\(status\)\}/,
  )
})

test('receipt viewer uses the shared transaction receipt sheet instead of inline receipt rendering', () => {
  const viewer = readFileSync(
    'components/receipts/ReceiptViewerClient.tsx',
    'utf8',
  )

  assert.match(
    viewer,
    /import TransactionReceiptSheet from '@\/components\/transactions\/TransactionReceiptSheet'/,
  )
  assert.match(viewer, /<TransactionReceiptSheet/)
  assert.match(viewer, /transactionId=\{selectedId\}/)
  assert.doesNotMatch(viewer, /<Receipt80mm/)
})

test('non-fiscalized transaction lists expose a bulk reset action for failed rows', () => {
  const adminList = readFileSync(
    'components/transactions/NonFiscalizedTransactionsPageClient.tsx',
    'utf8',
  )
  const managerList = readFileSync(
    'components/transactions/ManagerNonFiscalizedTable.tsx',
    'utf8',
  )
  const bulkButton = readFileSync(
    'components/transactions/BulkRetryFailedTransactionsButton.tsx',
    'utf8',
  )
  const bulkRoute = readFileSync(
    'app/api/transactions/retry-failed/route.ts',
    'utf8',
  )

  assert.match(adminList, /BulkRetryFailedTransactionsButton/)
  assert.match(managerList, /BulkRetryFailedTransactionsButton/)
  assert.match(bulkButton, /Reset Failed/)
  assert.match(bulkButton, /\/api\/transactions\/retry-failed/)
  assert.match(bulkRoute, /retryFailedTransactionFiscalization/)
  assert.match(bulkRoute, /Transaction is not FAILED/)
  assert.match(bulkRoute, /Customer link required before fiscalization retry/)
})

test('receipt list query uses positional parameters instead of bare numbers', () => {
  const receiptQuery = readFileSync(
    'src/modules/transactions/application/queries/get-receipt-route-data.ts',
    'utf8',
  )

  const addParamBlock = receiptQuery.match(
    /const addParam = \(value: unknown\) => \{[\s\S]*?\n  \}/,
  )?.[0]
  assert.ok(addParamBlock)
  assert.match(addParamBlock, /params\.push\(value\)/)
  assert.match(addParamBlock, /params\.length/)
  assert.match(receiptQuery, /LIMIT \$\{addParam\(pageSize\)\} OFFSET \$\{addParam\(offset\)\}/)
  assert.match(receiptQuery, /SELECT COUNT\(\*\)::text AS count/)
})

test('fiscalized client does not repeat the server browse query immediately on mount', () => {
  const client = readFileSync(
    'components/transactions/FiscalizedTransactionsPageClient.tsx',
    'utf8',
  )

  assert.match(client, /const hasMountedRef = useRef\(false\)/)
  assert.match(
    client,
    /if \(!hasMountedRef\.current\)[\s\S]*hasMountedRef\.current = true[\s\S]*if \(!error\) return/,
  )
})

test('fiscalized pagination narrows the transaction projection before receipt enrichment', () => {
  assert.match(repository, /const fiscalizedColumnsSql =/)
  const projection = repository.match(/const fiscalizedColumnsSql = `([\s\S]*?)`/)?.[1]
  assert.ok(projection)
  assert.doesNotMatch(projection, /t\.\*/)
  assert.doesNotMatch(projection, /doms_payload_json|fiscalization_response/)
  assert.match(repository, /if \(fiscalized && !hasSearch\)/)
  assert.match(repository, /FROM \([\s\S]*SELECT t\.id, t\.station_id[\s\S]*LIMIT \$\{params\.length \+ 1\} OFFSET \$\{params\.length \+ 2\}/)
  assert.match(repository, /const countFromSql = hasSearch \? fromSql : 'FROM transactions t'/)
})

test('fiscalized manager and admin grids expose page size and navigation', () => {
  const manager = readFileSync('components/transactions/FiscalizedTransactionsManagerClient.tsx', 'utf8')
  const client = readFileSync('components/transactions/FiscalizedTransactionsPageClient.tsx', 'utf8')
  for (const source of [manager, client]) {
    assert.match(source, /Rows per page/)
    assert.match(source, /10, 25, 50, 100/)
    assert.match(source, /Previous/)
    assert.match(source, /Next/)
  }
  assert.match(client, /setPage\(1\)/)
})

test('fiscalized page-first SQL binds limit and offset instead of interpolating numeric literals', () => {
  assert.match(
    repository,
    /LIMIT \$\$\{params\.length \+ 1\} OFFSET \$\$\{params\.length \+ 2\}/,
  )
  assert.doesNotMatch(
    repository,
    /^\s*LIMIT \$\{params\.length \+ 1\} OFFSET \$\{params\.length \+ 2\}/m,
  )
})

test('receipt viewer uses server pagination with 50-row default', () => {
  const viewer = readFileSync('components/receipts/ReceiptViewerClient.tsx', 'utf8')
  const route = readFileSync('app/api/receipts/route.ts', 'utf8')
  const receiptQuery = readFileSync(
    'src/modules/transactions/application/queries/get-receipt-route-data.ts',
    'utf8',
  )
  assert.match(viewer, /useState\(50\)/)
  assert.match(viewer, /Rows per page/)
  assert.match(viewer, /10, 25, 50, 100/)
  assert.match(viewer, /page: String\(page\), pageSize: String\(pageSize\)/)
  assert.match(route, /pageSize: Number\(searchParams\.get\('pageSize'\)/)
  assert.match(receiptQuery, /return \{ items: rows\.map/)
  assert.match(receiptQuery, /LIMIT \$\{addParam\(pageSize\)\} OFFSET \$\{addParam\(offset\)\}/)
})
