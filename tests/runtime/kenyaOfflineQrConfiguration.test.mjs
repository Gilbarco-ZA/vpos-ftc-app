import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const helper = readFileSync('src/modules/fiscalization/countries/kenya/qr.ts', 'utf8')
const store = readFileSync('src/modules/fiscalization/countries/kenya/siteConfiguration.ts', 'utf8')
const form = readFileSync('components/kenya/KenyaFiscalSiteClient.tsx', 'utf8')

test('Kenya offline evidence matches defined signature derivation and requires a valid invoice number', () => {
  assert.match(helper, /createHash\('sha256'\)/)
  assert.match(helper, /digest\('base64'\)/)
  assert.match(helper, /'PIN', 26/)
  assert.match(helper, /'RCPDATE', 16/)
  assert.match(helper, /Number\.isSafeInteger\(input\.invoiceNumber\)/)
})
test('Kenya QR mode configuration is saved separately from proxy-reported numbering', () => {
  assert.match(store, /saveKenyaQrSettings/)
  assert.match(store, /qrMode: existing\?\.qrMode/)
  assert.match(form, /Save QR settings/)
  assert.match(form, /PENDING FISCALIZATION/)
  assert.match(form, /Development \(KRA sandbox\)/)
  assert.match(form, /Production \(KRA live\)/)
  assert.match(form, /Manual/)
})
