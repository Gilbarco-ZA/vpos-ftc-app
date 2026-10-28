import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

test('pending receipt preview exposes manual print while blocking automatic print', () => {
  const view = readFileSync('components/transactions/TransactionReceiptSheet.tsx', 'utf8')
  assert.match(view, /Print Pending Receipt/)
  assert.match(view, /previewMode \? 'Print Pending Receipt' : 'Print Receipt'/)
  assert.match(view, /previewMode \|\|\s*!open/)
})

test('Kenya pending receipt print jobs carry offline flag and a visible fiscalization warning', () => {
  const route = readFileSync('app/api/receipts/print/route.ts', 'utf8')
  const worker = readFileSync('src/modules/printing/infrastructure/printJobs.ts', 'utf8')
  const formatter = readFileSync('src/modules/printing/domain/receiptPrintDocument.ts', 'utf8')
  assert.match(route, /offlinePrint: pendingKenya/)
  assert.match(worker, /payload\?\.data\?\.offlinePrint === true/)
  assert.match(formatter, /PENDING FISCALIZATION/)
})
