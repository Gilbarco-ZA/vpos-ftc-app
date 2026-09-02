#!/usr/bin/env node

import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const ROOT = process.cwd()
const BASELINE_PATH = path.join(ROOT, '.agent/module-boundary-baseline.json')
const EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']
const SOURCE_ROOTS = ['app', 'components', 'server', 'src', 'workers']
const IGNORED_DIRS = new Set(['.git', '.next', 'build', 'coverage', 'node_modules', 'out'])

function walk(dir) {
  if (!existsSync(dir)) return []
  const output = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory() && IGNORED_DIRS.has(entry.name)) continue
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) output.push(...walk(fullPath))
    else if (EXTENSIONS.includes(path.extname(entry.name))) output.push(fullPath)
  }
  return output
}

const files = SOURCE_ROOTS.flatMap((sourceRoot) => walk(path.join(ROOT, sourceRoot)))
const relative = (file) => path.relative(ROOT, file).replaceAll(path.sep, '/')

function resolveImport(fromFile, specifier) {
  let candidate
  if (specifier.startsWith('@/')) candidate = path.join(ROOT, specifier.slice(2))
  else if (specifier.startsWith('.')) candidate = path.resolve(path.dirname(fromFile), specifier)
  else return null

  const attempts = [
    candidate,
    ...EXTENSIONS.map((extension) => `${candidate}${extension}`),
    ...EXTENSIONS.map((extension) => path.join(candidate, `index${extension}`)),
  ]
  const resolved = attempts.find((attempt) => existsSync(attempt) && statSync(attempt).isFile())
  return resolved ? relative(resolved) : null
}

function importTargets(file) {
  const content = readFileSync(file, 'utf8')
  const targets = new Set()
  const pattern = /(?:import|export)\s+(?:type\s+)?(?:[^'";]*?\s+from\s+)?['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/g
  let match
  while ((match = pattern.exec(content)) !== null) {
    const target = resolveImport(file, match[1] ?? match[2])
    if (target) targets.add(target)
  }
  return [...targets]
}

const violations = {
  apiRouteToInfrastructure: [],
  sharedToFeature: [],
  domainToInfrastructure: [],
}

for (const file of files) {
  const source = relative(file)
  for (const target of importTargets(file)) {
    const edge = `${source} -> ${target}`
    if (
      source.startsWith('app/api/') &&
      (target.startsWith('src/platform/db/') || /^src\/modules\/[^/]+\/infrastructure\//.test(target))
    ) {
      violations.apiRouteToInfrastructure.push(edge)
    }
    if (source.startsWith('src/shared/') && target.startsWith('src/modules/')) {
      violations.sharedToFeature.push(edge)
    }
    if (
      /^src\/modules\/[^/]+\/domain\//.test(source) &&
      (target.includes('/infrastructure/') || target.startsWith('src/platform/'))
    ) {
      violations.domainToInfrastructure.push(edge)
    }
  }
}

for (const values of Object.values(violations)) values.sort()

if (process.argv.includes('--update-baseline')) {
  const baseline = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    note: 'Existing migration debt. New entries fail the architecture check; removing entries is encouraged.',
    violations,
  }
  writeFileSync(BASELINE_PATH, `${JSON.stringify(baseline, null, 2)}\n`)
  console.log(`Updated ${path.relative(ROOT, BASELINE_PATH)}`)
  process.exit(0)
}

if (!existsSync(BASELINE_PATH)) {
  console.error('Module boundary baseline is missing. Run with --update-baseline after reviewing current violations.')
  process.exit(1)
}

const baseline = JSON.parse(readFileSync(BASELINE_PATH, 'utf8')).violations ?? {}
const additions = []
const reductions = []
for (const [category, current] of Object.entries(violations)) {
  const accepted = new Set(baseline[category] ?? [])
  for (const edge of current) if (!accepted.has(edge)) additions.push(`${category}: ${edge}`)
  const currentSet = new Set(current)
  for (const edge of accepted) if (!currentSet.has(edge)) reductions.push(`${category}: ${edge}`)
}

for (const [category, current] of Object.entries(violations)) {
  console.log(`${category}: ${current.length} current baseline violation(s)`)
}
if (reductions.length > 0) {
  console.log(`Resolved since baseline: ${reductions.length}. Refresh the baseline in a dedicated cleanup change.`)
}
if (additions.length > 0) {
  console.error('\nNew module boundary violations detected:')
  for (const addition of additions) console.error(`- ${addition}`)
  process.exit(1)
}

console.log('Module boundary check passed: no new violations.')
