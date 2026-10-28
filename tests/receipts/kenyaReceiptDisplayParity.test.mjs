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

test('Kenya receipt has required fiscal labels and omits redundant labels', () => {
  for (const content of [kenya, print]) {
    assert.match(content, /SCU INFORMATION/)
    assert.match(content, /SCU ID:/)
    assert.match(content, /CU INVOICE NO:/)
    assert.doesNotMatch(content, /Normal Invoice/)
    assert.doesNotMatch(content, /KRA Verification QR/)
    assert.doesNotMatch(content, /Verification Code:/)
  }
  assert.ok(kenya.indexOf('TAX INVOICE') > kenya.indexOf('PIN:'))
  assert.ok(print.indexOf("text('TAX INVOICE'") > print.indexOf("text('PIN: '"))
  assert.match(kenya, /\['A', 'B', 'C', 'D', 'E'/)
  assert.match(print, /\['A', 'B', 'C', 'D', 'E'\]/)
  assert.match(kenya, /receiptHeaderText/)
  assert.match(kenya, /receiptFooterText/)
  assert.match(print, /model\.customization\?\.headerLines/)
  assert.match(print, /model\.customization\?\.footerLines/)
})

test('Kenya preview formats stored JavaScript date strings as dd/MM/yyyy', () => {
  assert.match(kenya, /const parsed = new Date\(value\)/)
  assert.match(kenya, /parsed\.getDate\(\)/)
  assert.match(kenya, /parsed\.getMonth\(\) \+ 1/)
})
