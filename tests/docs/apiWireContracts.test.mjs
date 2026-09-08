import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'

const root = process.cwd()
const contractsDir = path.join(root, 'docs', 'manuals', 'api-contracts')
const indexPath = path.join(root, 'docs', 'manuals', 'API_WIRE_CONTRACTS.md')

const contractFiles = [
  'COMMON_AND_AUTH.md',
  'BUSINESS.md',
  'CATALOG_STOCK_REPORTING_MISC.md',
  'SETTINGS_SETUP_ADMIN.md',
  'RUNTIME_SUPPORT.md',
  'FORECOURT_AND_COMPATIBILITY.md',
]

test('installed-package API wire contract reference exists and links every contract file', () => {
  const index = fs.readFileSync(indexPath, 'utf8')

  for (const filename of contractFiles) {
    assert.match(index, new RegExp(filename.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
    assert.equal(fs.existsSync(path.join(contractsDir, filename)), true)
  }
})

test('wire contract files do not use unresolved request/response placeholder notation', () => {
  for (const filename of contractFiles) {
    const contents = fs.readFileSync(path.join(contractsDir, filename), 'utf8')

    // The contract reference may discuss the old notation in prose, but it must
    // not use it as an endpoint request/response type declaration.
    assert.doesNotMatch(contents, /\|\s*`B<[^`]+>`\s*\|/)
    assert.doesNotMatch(contents, /\|\s*`OK<[^`]+>`\s*\|/)
  }
})
