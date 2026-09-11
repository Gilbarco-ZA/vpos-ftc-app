import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

const read = (path) => fs.readFileSync(path, 'utf8')

test('proxy pre-fiscal receipt preparation is not disabled with internal fiscalization workers', () => {
  const composition = read('src/platform/runtime/composition-root.ts')
  const inProcess = read('src/modules/runtime/infrastructure/inProcessRuntime.ts')

  const dedicatedConditional = composition.match(
    /if \(shouldRunInternalFiscalizationWorkers\(\)\) \{([\s\S]*?)\n  \}/,
  )?.[1] ?? ''
  assert.doesNotMatch(
    dedicatedConditional,
    /startOfflineReceiptPrintRuntimeWorker/,
  )
  assert.match(composition, /startOfflineReceiptPrintRuntimeWorker\(\{ pollMs: txPollMs \}\)/)

  const conditionalWorkerBlock = inProcess.match(
    /\.\.\.\(shouldRunInternalFiscalizationWorkers\(\)[\s\S]*?\? \[([\s\S]*?)\]\s*: \[\]\)/,
  )?.[1] ?? ''
  assert.doesNotMatch(conditionalWorkerBlock, /name: 'offlineReceiptPrintWorker'/)
  assert.match(inProcess, /name: 'offlineReceiptPrintWorker'/)
  assert.match(inProcess, /start: \(\) => startOfflineReceiptPrintWorker\(\)/)
})

test('Tanzania pre-fiscal receipt assignment uses transaction time as invoice time', () => {
  const assignment = read(
    'src/modules/tanzania-fiscal/infrastructure/preFiscalizationReceiptAssignment.ts',
  )

  assert.match(
    assignment,
    /const invoiceDate = new Date\(row\.transaction_date_time\)\.toISOString\(\)/,
  )
  assert.match(assignment, /const fiscalDate = transactionDate/)
  assert.doesNotMatch(assignment, /const invoiceDate = new Date\(\)\.toISOString\(\)/)
})

test('Tanzania proxy invoice metadata uses transaction time rather than send time', () => {
  const proxyInvoice = read(
    'src/modules/tanzania-fiscal/infrastructure/proxyInvoice.ts',
  )

  assert.match(
    proxyInvoice,
    /args\.transaction\?\.transaction_date_time \?\? invoice\.issueDateTime/,
  )
  assert.match(proxyInvoice, /const fiscalizationDate = transactionDate/)
  assert.doesNotMatch(
    proxyInvoice,
    /const fiscalizationDate = new Date\(\)\.toISOString\(\)/,
  )
  assert.match(
    proxyInvoice,
    /invoiceDate: isoDateTimeInTimezone\(row\.invoice_date, args\.timezone\)/,
  )
})

test('timestamp backfill only changes assignments that have not been submitted or fiscalized', () => {
  const migration = read(
    'scripts/migrations/postgres/1330_tanzania_unfiscalized_assignment_time_backfill.sql',
  )

  assert.match(migration, /SET invoice_date = t\.transaction_date_time/)
  assert.match(migration, /t\.fiscalization_reference IS NULL/)
  assert.match(migration, /t\.cloud_transaction_id IS NULL/)
  assert.match(
    migration,
    /t\.status IN \('OPEN', 'ALLOCATED', 'PENDING', 'FAILED', 'FISCALIZING'\)/,
  )
  assert.doesNotMatch(migration, /SET[\s\S]*invoice_number\s*=/)
  assert.doesNotMatch(migration, /SET[\s\S]*daily_counter\s*=/)
  assert.doesNotMatch(migration, /SET[\s\S]*global_counter\s*=/)
})
