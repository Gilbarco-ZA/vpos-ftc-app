import assert from 'node:assert/strict'
import test from 'node:test'
import { getCountryProductPolicy } from '@/src/modules/fiscalization/application/productPolicyRegistry'

const product = {
  id: 'PRD-1', code: 'KE2TYL0000001', name: 'Petrol 93',
  classCode: '9901300102', typeCode: '2', price: 183,
  currency: 'KES', taxCode: 'B', unitOfMeasure: 'L',
  unitOfPackaging: 'TY', hazardousIndicator: true,
}

test('Kenya builds exact batch registration shape', () => {
  const policy = getCountryProductPolicy('KEN')
  assert.deepEqual(policy.buildRegistration([product], { createdByName: 'Test User' }), {
    products: [{
      createdByName: 'Test User', productId: 'PRD-1',
      productCode: 'KE2TYL0000001', productClassCode: '9901300102',
      productTypeCode: '2', productName: 'Petrol 93', unitOfMeasure: 'L',
      unitOfPackaging: 'TY', unitPrice: 183, currency: 'KES',
      taxCode: 'B', hazardousIndicator: true,
    }],
  })
  assert.equal(policy.validate({ ...product, typeCode: 'PRODUCT' }).valid, true)
  assert.equal(policy.validate({ ...product, typeCode: 'FUEL' }).valid, false)
  assert.equal(policy.validate({ ...product, taxCode: 'VAT' }).valid, false)
})

test('unknown Kenya grade never guesses a product class', () => {
  const defaults = getCountryProductPolicy('KE').defaultsForFuel('Mystery fuel')
  assert.equal(defaults.classCode, undefined)
  assert.equal(defaults.typeCode, '2')
})

test('Tanzania product payload remains individually shaped', () => {
  const policy = getCountryProductPolicy('TZ')
  const tzProduct = {
    ...product, code: 'G10', classCode: 'FUEL', typeCode: 'PETROL',
    currency: 'TZS', taxCode: 'A',
  }
  const registration = policy.buildRegistration([tzProduct], { createdByName: 'Test User' })
  assert.ok(Array.isArray(registration))
  assert.equal(registration.length, 1)
  assert.equal(registration[0].productCode, 'G10')
  assert.equal(policy.validate(tzProduct).valid, true)
})

test('unknown country has no fallback', () => {
  assert.throws(() => getCountryProductPolicy('ZZ'), /Unsupported fiscalization country/)
})
