import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(here, '../..')
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8')

test('offline TRA submissions enqueue a distinct marked receipt print', () => {
  const detector = read(
    'src/modules/transactions/infrastructure/fiscalization/proxyOfflineSubmission.ts',
  )
  const worker = read(
    'src/modules/transactions/infrastructure/fiscalization/offlineReceiptPrintWorker.ts',
  )
  const autoPrint = read(
    'src/modules/transactions/infrastructure/fiscalization/autoPrintFiscalReceipt.ts',
  )
  const payload = read('src/modules/printing/domain/printJobPayload.ts')
  const printJobs = read('src/modules/printing/infrastructure/printJobs.ts')
  const receiptDocument = read(
    'src/modules/printing/domain/receiptPrintDocument.ts',
  )
  const runtime = read(
    'src/modules/runtime/infrastructure/inProcessRuntime.ts',
  )
  const composition = read('src/platform/runtime/composition-root.ts')

  assert.match(detector, /OFFLINE_SUCCESS/)
  assert.match(detector, /isOnline/)
  assert.match(detector, /isFiscalized/)

  assert.match(worker, /event\.status = 'PENDING'/)
  assert.match(worker, /event\.transport = 'proxy'/)
  assert.match(worker, /ss\.auto_print_receipts = TRUE/)
  assert.match(worker, /isOfflineProxySubmission/)
  assert.match(worker, /offlinePrint: true/)
  assert.match(worker, /receipt:' \|\| t\.id::text \|\| ':offline'/)

  assert.match(autoPrint, /offlinePrint\?: boolean/)
  assert.match(autoPrint, /vpos\.auto-print-offline-receipt/)
  assert.match(autoPrint, /receipt:\$\{input\.transactionId\}:offline/)
  assert.match(payload, /'offlinePrint'/)
  assert.match(printJobs, /offlinePrint: payload\?\.offlinePrint === true/)

  assert.match(receiptDocument, /value: 'OFFLINE PRINT'/)
  assert.match(receiptDocument, /if \(!offlinePrint && qrData\)/)
  assert.match(runtime, /startOfflineReceiptPrintWorker/)
  assert.match(composition, /startOfflineReceiptPrintRuntimeWorker/)
})
