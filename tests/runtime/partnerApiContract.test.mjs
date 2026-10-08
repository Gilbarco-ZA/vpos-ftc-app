import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

const read = (path) => fs.readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8')

test('partner docs define raw DTOs required by third-party readers', () => {
  const business = read('docs/manuals/api-contracts/BUSINESS.md')
  for (const name of [
    'interface RawCustomerRow',
    'interface RawTransactionLine',
    'interface RawTransactionQueueRow',
    'interface RawPreFuelAllocation',
  ]) {
    assert.match(business, new RegExp(name))
  }
  assert.match(business, /consumed_at/)
  assert.match(business, /cancelled_at/)
})

test('partner API has a versioned OpenAPI contract and isolated sandbox', () => {
  const openapi = read('docs/partner-api/v1/openapi.yaml')
  const sandbox = read('scripts/partner-api-sandbox.mjs')
  assert.match(openapi, /^openapi: 3\.1\.0/m)
  assert.match(openapi, /\/transactions\/pre-fuel-customer:/)
  assert.match(openapi, /PreFuelAllocation:/)
  assert.match(sandbox, /node:http/)
  assert.doesNotMatch(sandbox, /@\/src\//)
  assert.doesNotMatch(sandbox, /postgres|pg\b|doms|jpl|certificate|private.?key/i)
})
