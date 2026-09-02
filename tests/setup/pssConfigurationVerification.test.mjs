import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const read = (path) => readFileSync(path, 'utf8')

test('PSS verification compares grades with PSS-managed FTC products only', () => {
  const counts = read(
    'src/modules/setup/application/getSetupForecourtCounts.ts',
  )
  const verifier = read('components/setup/PssConfigurationVerification.tsx')

  assert.match(counts, /PSS_XML_KEYS\.ID_MAP/)
  assert.match(counts, /productDbIdByGradeId/)
  assert.match(counts, /pssProducts:/)
  assert.match(counts, /id::text = ANY\(\$2::text\[\]\)/)
  assert.match(counts, /product_class_code[\s\S]*FUEL/)

  assert.match(verifier, /pssManagedProductCount/)
  assert.match(verifier, /pss\.grades === pssManagedProductCount/)
  assert.match(verifier, /FTC PSS-managed/)
  assert.match(verifier, /POS-only products are excluded from this check/)
  assert.doesNotMatch(verifier, /pss\.grades === counts\.products/)
})
