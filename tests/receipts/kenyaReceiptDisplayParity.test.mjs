import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const preview = readFileSync('components/receipts/Receipt80mm.tsx', 'utf8')
const kenya = readFileSync('components/receipts/KenyaReceipt80mm.tsx', 'utf8')
const print = readFileSync('src/shared/fiscalization/receipt/templates/KE.ts', 'utf8')

test('Kenya receipt preview selects KRA-specific renderer', () => {
  assert.match(preview, /return <KenyaReceipt80mm receipt=\{receipt\} \/>/)
})
test('Kenya preview and printer share KRA invoice section headings', () => {
  for (const title of ['TAX INVOICE', 'TOTAL BEFORE DISCOUNT', 'TOTAL DISCOUNT AWARDED', 'SUB TOTAL', 'VAT', 'ITEMS NUMBER', 'SCU INFORMATION', 'Receipt Signature:', 'THANK YOU']) {
    assert.ok(kenya.includes(title), 'preview lacks: ' + title)
    assert.ok(print.includes(title), 'print template lacks: ' + title)
  }
})
test('Kenya preview QR requires a URL, not the legacy JSON fiscal payload', () => {
  assert.match(kenya, /isKraUrl\(verificationUrl\)/)
  assert.match(print, /https:/)
})
