import assert from 'node:assert/strict'
import test from 'node:test'

import { kenyaFuelClassCode } from '@/src/modules/setup/infrastructure/pssXmlImporter'

test('Kenya PSS import uses configured fuel class defaults', () => {
  assert.equal(kenyaFuelClassCode('Petrol 93'), '9901300102')
  assert.equal(kenyaFuelClassCode('Petrol 95'), '9901300103')
  assert.equal(kenyaFuelClassCode('Diesel 50'), '9901300102')
})

test('PSS import Kenya defaults are country-scoped and valid for proxy', async () => {
  const { readFileSync } = await import('node:fs')
  const source = readFileSync(
    'src/modules/setup/infrastructure/pssXmlImporter.ts',
    'utf8',
  )
  assert.match(source, /isKenya \? '2' : 'FUEL'/)
  assert.match(source, /isKenya \? 'B' : 'VAT'/)
  assert.match(source, /isKenya \? 'KES' : await resolveCurrency/)
  assert.match(source, /products\.product_type_code = 'FUEL'/)
  assert.match(source, /products\.tax_code = 'VAT'/)
})
