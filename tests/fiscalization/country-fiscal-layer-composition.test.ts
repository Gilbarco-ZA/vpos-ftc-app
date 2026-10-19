import assert from 'node:assert/strict'
import test from 'node:test'

import {
  assertFiscalLayerNotLive,
  createCountryFiscalLayer,
  getFiscalLayerPolicy,
} from '@/src/modules/fiscalization/application/countryFiscalLayer'
import { countryFiscalizationRegistry } from '@/src/modules/fiscalization/application/countryRegistry'

test('Kenya policies compose without registering production adapters', () => {
  const layer = createCountryFiscalLayer('KEN')
  assert.equal(layer.countryCode, 'KE')
  assert.equal(layer.definition.currency, 'KES')
  assert.equal(layer.receipts.countryCode, 'KE')
  assert.equal(typeof layer.invoices.buildPayload, 'function')
  assert.equal(typeof layer.products.buildRegistration, 'function')
  assert.equal(typeof layer.creditNotes.buildPayload, 'function')
  assert.equal(layer.normalizeStatus({ error: false, status: 'fiscalizing' }).state, 'processing')
  assertFiscalLayerNotLive(layer)
  assert.equal(layer.productionConnected, false)
  assert.deepEqual(countryFiscalizationRegistry.available(), [])
})

test('Tanzania composes policies but refuses unverified credit-note execution', () => {
  const layer = createCountryFiscalLayer('Tanzania')
  assert.equal(layer.countryCode, 'TZ')
  assert.equal(layer.receipts.countryCode, 'TZ')
  assert.equal(layer.normalizeStatus({ error: true, status: 'unknown' }).safeToResubmit, false)
  assert.throws(() => layer.creditNotes.buildPayload(), /not yet verified/)
  assertFiscalLayerNotLive(layer)
})

test('lookup returns correct operation and unknown countries fail closed', () => {
  const layer = createCountryFiscalLayer('KE')
  assert.equal(getFiscalLayerPolicy('KE', 'products'), layer.products)
  assert.equal(getFiscalLayerPolicy('KE', 'receipts'), layer.receipts)
  assert.throws(() => createCountryFiscalLayer('ZA'), /Unsupported fiscalization country/)
  assert.throws(() => getFiscalLayerPolicy('ZA', 'status'), /Unsupported fiscalization country/)
})
