import assert from 'node:assert/strict'
import test from 'node:test'

import {
  createEmptyForm,
  withPackagingSelection,
  withStationCurrency,
} from '@/components/products/products.types'
import { resolveDefaultProductCurrency } from '@/src/modules/products/application/product-currency-policy'

test('station country currency takes precedence over configured currency options', () => {
  assert.equal(
    resolveDefaultProductCurrency({
      stationCurrency: 'KES',
      configuredOptions: ['USD', 'EUR'],
      environmentDefault: 'ZAR',
    }),
    'KES',
  )
})

test('product form keeps station currency on local and external fields', () => {
  const form = withStationCurrency(createEmptyForm('USD'), 'TZS')

  assert.equal(form.currency, 'TZS')
  assert.equal(form.extCurrency, 'TZS')
})

test('pack size selection updates the packaging fields together', () => {
  const form = withPackagingSelection(createEmptyForm('KES'), 'BX')

  assert.equal(form.unitOfPackaging, 'BX')
  assert.equal(form.extUnitOfPackaging, 'BX')
})
