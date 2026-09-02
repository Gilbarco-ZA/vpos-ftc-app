import { readFile } from 'node:fs/promises'
import { extname } from 'node:path'

import { discoverTests } from './test-suite.mjs'

const tests = await discoverTests('tests')
const records = await Promise.all(
  tests.map(async (file) => ({ file, source: await readFile(file, 'utf8') })),
)

const countBy = (values) =>
  Object.fromEntries(
    [...new Set(values)]
      .sort((a, b) => a.localeCompare(b))
      .map((value) => [value, values.filter((entry) => entry === value).length]),
  )

const summary = {
  testFiles: tests.length,
  byArea: countBy(
    tests.map((file) => {
      const parts = file.split('/')
      return parts.length > 2 ? parts[1] : 'root'
    }),
  ),
  byExtension: countBy(
    tests.map((file) => {
      const extension = extname(file)
      const withoutExtension = file.slice(0, -extension.length)
      return `${extname(withoutExtension)}${extension}`
    }),
  ),
  sourceGuardFiles: records
    .filter(({ source }) => /\breadFile(?:Sync)?\s*\(/.test(source))
    .map(({ file }) => file),
  privatePackageImports: records
    .filter(({ source }) => source.includes('@gilbarcoafs/'))
    .map(({ file }) => file),
  timerFiles: records
    .filter(({ source }) => /\bsetTimeout\s*\(/.test(source))
    .map(({ file }) => file),
  focusedTests: records
    .filter(({ source }) => /\b(?:test|it|describe)\.only\s*\(/.test(source))
    .map(({ file }) => file),
  unconditionalSkips: records
    .filter(({ source }) => /\b(?:test|it|describe)\.(?:skip|todo)\s*\(/.test(source))
    .map(({ file }) => file),
}

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(summary, null, 2))
} else {
  console.log(`Test files: ${summary.testFiles}`)
  console.log(`Areas: ${JSON.stringify(summary.byArea)}`)
  console.log(`Extensions: ${JSON.stringify(summary.byExtension)}`)
  console.log(`Source-guard files: ${summary.sourceGuardFiles.length}`)
  console.log(`Private-package import files: ${summary.privatePackageImports.length}`)
  console.log(`Timer-based files: ${summary.timerFiles.length}`)
  console.log(`Focused .only files: ${summary.focusedTests.length}`)
  console.log(`Unconditional skip/todo files: ${summary.unconditionalSkips.length}`)
}

if (summary.focusedTests.length > 0) {
  console.error(`Focused tests must not be committed: ${summary.focusedTests.join(', ')}`)
  process.exit(1)
}
