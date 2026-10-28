import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const wrapper = readFileSync('components/products/ProductsAddSheetWrapper.tsx', 'utf8')
const content = readFileSync('components/products/ProductsUpsertSheetContent.tsx', 'utf8')

test('new product form does not pass a newly created initialValues object on every render', () => {
  assert.doesNotMatch(wrapper, /initialValues=\{createEmptyForm\(/)
  assert.match(wrapper, /key=\{isOpen \?/)
  assert.match(content, /createEmptyForm\(defaultCurrency\)/)
})
