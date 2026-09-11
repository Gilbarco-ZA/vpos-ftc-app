import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'

const root = process.cwd()
const formatter = fs.readFileSync(
  path.join(root, 'src/shared/receipts/receiptDateTimeDisplay.ts'),
  'utf8',
)
const tanzaniaReceipt = fs.readFileSync(
  path.join(root, 'components/receipts/TanzaniaReceipt80mm.tsx'),
  'utf8',
)

test('receipt display formatter supports JavaScript Date strings without exposing timezone text', () => {
  assert.match(formatter, /Thu Sep 10 2026 17:13:01 GMT\+0200/)
  assert.match(formatter, /return `\$\{pad2\(jsDate\[2\]\)\}-\$\{month\}-\$\{jsDate\[3\]\}`/)
  assert.match(formatter, /literalTime/)
})

test('Tanzania receipt renders simplified Date and Time labels', () => {
  assert.match(tanzaniaReceipt, /formatReceiptDateTimeDisplay/)
  assert.match(tanzaniaReceipt, /<span>Date:<\/span>/)
  assert.match(tanzaniaReceipt, /<span>Time:<\/span>/)
  assert.doesNotMatch(tanzaniaReceipt, /RECEIPT DATE:/)
  assert.doesNotMatch(tanzaniaReceipt, /RECEIPT TIME:/)
})
