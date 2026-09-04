import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(here, '../..')
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8')

test('transaction list search is receipt-number based rather than POS-reference based', () => {
  const repository = read(
    'src/modules/transactions/infrastructure/persistence/transaction-list-with-receipts.repository.ts',
  )
  const query = read(
    'src/modules/transactions/application/queries/list-transactions.ts',
  )
  const adminNonFiscalized = read(
    'components/transactions/NonFiscalizedTransactionsPageClient.tsx',
  )
  const adminFiscalized = read(
    'components/transactions/FiscalizedTransactionsPageClient.tsx',
  )
  const receiptViewer = read('components/receipts/ReceiptViewerClient.tsx')
  const managerNonFiscalized = read(
    'components/transactions/ManagerNonFiscalizedTable.tsx',
  )
  const managerFiscalized = read(
    'components/transactions/FiscalizedTransactionsManagerClient.tsx',
  )

  assert.match(query, /listTransactionsWithReceiptNumbersRepo/)
  assert.match(repository, /receipt_info\.receipt_number/)
  assert.match(repository, /FROM receipts r/)
  assert.match(repository, /fiscalization_events fe/)
  assert.doesNotMatch(repository, /pos_reference[^\n]*ILIKE/)

  assert.match(adminNonFiscalized, /<TableHead>Receipt number<\/TableHead>/)
  assert.match(adminNonFiscalized, /row\.receiptNumber/)
  assert.doesNotMatch(adminNonFiscalized, /<TableHead>POS reference<\/TableHead>/)

  assert.match(adminFiscalized, /<TableHead>Receipt number<\/TableHead>/)
  assert.match(adminFiscalized, /row\.receiptNumber/)
  assert.doesNotMatch(adminFiscalized, /<TableHead>POS reference<\/TableHead>/)

  assert.match(receiptViewer, /Search receipt number/)
  assert.match(receiptViewer, /<TableHead>Receipt number<\/TableHead>/)
  assert.match(managerNonFiscalized, /<TableHead>Receipt number<\/TableHead>/)
  assert.match(managerFiscalized, /<TableHead>Receipt number<\/TableHead>/)
})

test('stuck FISCALIZING transactions can cancel only the attempt and become retryable', () => {
  const route = read(
    'app/api/transactions/[id]/cancel-fiscalization/route.ts',
  )
  const repository = read(
    'src/modules/transactions/infrastructure/fiscalization/cancel-stuck-fiscalization.repository.ts',
  )
  const admin = read(
    'components/transactions/NonFiscalizedTransactionsPageClient.tsx',
  )
  const manager = read(
    'components/transactions/ManagerNonFiscalizedTable.tsx',
  )

  assert.match(route, /roles: \['manager', 'administrator'\]/)
  assert.match(route, /cancelStuckTransactionFiscalization/)
  assert.match(repository, /status !== 'FISCALIZING'/)
  assert.match(repository, /SET status = 'FAILED'/)
  assert.match(repository, /cloud_transaction_id = NULL/)
  assert.match(repository, /fiscal_document_id = NULL/)
  assert.match(repository, /fiscalization_events/)
  assert.match(repository, /transaction_queue/)
  assert.match(repository, /status IN \('PENDING', 'PROCESSING'\)/)
  assert.match(admin, /Cancel fiscalization attempt/)
  assert.match(admin, /cancel-fiscalization/)
  assert.match(manager, /Cancel fiscalization attempt/)
  assert.match(manager, /cancel-fiscalization/)
})
