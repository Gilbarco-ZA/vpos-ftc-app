import assert from 'node:assert/strict'
import test from 'node:test'

import {
  discoverTests,
  filterTests,
  isTestFile,
} from '../../scripts/test-suite.mjs'

test('test discovery includes TypeScript and JavaScript test modules', async () => {
  const tests = await discoverTests('tests')

  assert.ok(tests.includes('tests/config/legacy-import-paths.test.mjs'))
  assert.ok(tests.includes('tests/runtime/runtimeArchivePolicy.test.ts'))
  assert.ok(tests.includes('tests/runtime/testRunnerPolicy.test.mjs'))
  assert.deepEqual(tests, [...tests].sort((a, b) => a.localeCompare(b)))
  assert.equal(new Set(tests).size, tests.length)
})

test('test discovery accepts supported test and spec extensions', () => {
  assert.equal(isTestFile('feature.test.ts'), true)
  assert.equal(isTestFile('feature.test.tsx'), true)
  assert.equal(isTestFile('feature.test.mjs'), true)
  assert.equal(isTestFile('feature.spec.cjs'), true)
  assert.equal(isTestFile('feature.ts'), false)
})

test('test filtering uses normalized repository-relative paths', () => {
  assert.deepEqual(
    filterTests(
      [
        'tests/runtime/a.test.ts',
        'tests/forecourt/b.test.ts',
        'tests/runtime/c.test.mjs',
      ],
      'tests\\runtime',
    ),
    ['tests/runtime/a.test.ts', 'tests/runtime/c.test.mjs'],
  )
})
