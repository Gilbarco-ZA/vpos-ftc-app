import assert from 'node:assert/strict'
import test from 'node:test'

import { assessFiscalLayerReadiness } from '@/src/modules/fiscalization/application/fiscalLayerReadiness'
import { createCountryFiscalLayer } from '@/src/modules/fiscalization/application/countryFiscalLayer'
import type { CountryFiscalizationAdapter } from '@/src/modules/fiscalization/domain/countryAdapter'

test('both composed layers satisfy the shared adapter contract', () => {
  const kenya: CountryFiscalizationAdapter = createCountryFiscalLayer('KEN')
  const tanzania: CountryFiscalizationAdapter = createCountryFiscalLayer('TZA')
  assert.equal(kenya.countryCode, 'KE')
  assert.equal(tanzania.countryCode, 'TZ')
  assert.equal(kenya.productionConnected, false)
  assert.equal(tanzania.productionConnected, false)
})

test('readiness is conservative and separate from advertised capabilities', () => {
  const kenya = assessFiscalLayerReadiness('KE')
  const tanzania = assessFiscalLayerReadiness('TZ')
  assert.equal(kenya.readyForProduction, false)
  assert.equal(tanzania.readyForProduction, false)
  assert.equal(kenya.features.length, 5)
  assert.equal(tanzania.features.find(item => item.feature === 'creditNotes')?.stage, 'not-implemented')
  assert.ok(kenya.features.every(item => item.blockers.length > 0))
  assert.ok(tanzania.features.every(item => item.blockers.length > 0))
})

test('unsupported countries fail closed', () => {
  assert.throws(() => assessFiscalLayerReadiness('XX'), /Unsupported fiscalization country/)
})
