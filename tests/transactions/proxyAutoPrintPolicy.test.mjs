import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(here, '../..')
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8')

test('proxy fiscalization auto-prints immediate and reconciled successes idempotently', () => {
  const helper = read(
    'src/modules/transactions/infrastructure/fiscalization/autoPrintFiscalReceipt.ts',
  )
  const worker = read(
    'src/modules/transactions/infrastructure/fiscalization/proxySenderWorker.ts',
  )

  assert.match(helper, /SELECT auto_print_receipts/)
  assert.match(helper, /settings\?\.auto_print_receipts !== true/)
  assert.match(helper, /getOrCreateLatestTransactionReceiptRepo/)
  assert.match(helper, /'print\.receipt'/)
  assert.match(helper, /'vpos\.auto-print-receipt'/)
  assert.match(helper, /'vpos\.auto-print-offline-receipt'/)
  assert.match(helper, /`receipt:\$\{input\.transactionId\}:default`/)
  assert.match(helper, /`receipt:\$\{input\.transactionId\}:offline`/)
  assert.match(helper, /sourceTransactionId: input\.transactionId/)
  assert.match(helper, /payloadMode: 'reference'/)

  const calls = worker.match(/enqueueAutoPrintFiscalReceipt\(\{/g) ?? []
  assert.equal(calls.length, 2)
  assert.match(worker, /proxy fiscalization result reconciled/)
  assert.match(worker, /proxy submit succeeded/)
  assert.match(worker, /proxy auto-print enqueue failed/)
  assert.match(worker, /autoPrintEnqueued/)
})
