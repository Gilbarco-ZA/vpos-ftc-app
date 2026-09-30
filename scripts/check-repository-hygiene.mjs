#!/usr/bin/env node

import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'

const ROOT = process.cwd()
const SOURCE_ROOTS = ['app', 'components', 'server', 'src', 'workers']
const SOURCE_EXTENSIONS = new Set(['.cjs', '.js', '.jsx', '.mjs', '.ts', '.tsx'])
const ROUTE_SEGMENT_CONFIG_EXPORTS = [
  'dynamic',
  'dynamicParams',
  'fetchCache',
  'maxDuration',
  'preferredRegion',
  'revalidate',
  'runtime',
]
const IGNORED_DIRS = new Set(['.git', '.next', 'build', 'coverage', 'node_modules', 'out'])
const forbiddenPaths = [
  'public/certs',
  'tsconfig.tsbuildinfo',
  'vpos-server.cjs',
  '.config/changelog.log',
  '.config/changelog.archive.log',
  '.agent/files.json',
  '.agent/imports.json',
  '.agent/public-api.json',
  '.agent/symbols.json',
]

function walk(relativeDir = '.') {
  const absoluteDir = path.join(ROOT, relativeDir)
  if (!existsSync(absoluteDir)) return []
  const output = []
  for (const entry of readdirSync(absoluteDir, { withFileTypes: true })) {
    if (entry.isDirectory() && IGNORED_DIRS.has(entry.name)) continue
    const relativePath = path.posix.join(relativeDir.replaceAll('\\', '/'), entry.name)
      .replace(/^\.\//, '')
    if (entry.isDirectory()) output.push(...walk(relativePath))
    else output.push(relativePath)
  }
  return output
}

const failures = []
for (const relativePath of forbiddenPaths) {
  if (existsSync(path.join(ROOT, relativePath))) {
    failures.push(`Forbidden generated or credential path exists: ${relativePath}`)
  }
}

const allFiles = walk()
for (const relativePath of allFiles) {
  if (!relativePath.endsWith('/route.ts') && !relativePath.endsWith('/route.js')) continue
  const source = readFileSync(path.join(ROOT, relativePath), 'utf8')
  for (const configName of ROUTE_SEGMENT_CONFIG_EXPORTS) {
    const reexportPattern = new RegExp(
      `export\\s*\\{[^}]*\\b${configName}\\b[^}]*\\}\\s*from`,
      'm',
    )
    if (reexportPattern.test(source)) {
      failures.push(
        `Route segment config must be declared locally, not re-exported: ${relativePath} (${configName})`,
      )
    }
  }
}
for (const relativePath of allFiles) {
  const absolutePath = path.join(ROOT, relativePath)
  const stat = statSync(absolutePath)
  if (stat.size > 5_000_000 && !relativePath.endsWith('package-lock.json')) {
    failures.push(`Unexpected file larger than 5 MB: ${relativePath}`)
  }
  if (stat.size > 2_000_000) continue
  const content = readFileSync(absolutePath)
  if (/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(content.toString('utf8'))) {
    failures.push(`Private key material detected: ${relativePath}`)
  }
}

const hashes = new Map()
for (const root of SOURCE_ROOTS) {
  for (const relativePath of walk(root)) {
    if (!SOURCE_EXTENSIONS.has(path.extname(relativePath).toLowerCase())) continue
    const content = readFileSync(path.join(ROOT, relativePath))
    if (content.length === 0) continue
    const digest = createHash('sha256').update(content).digest('hex')
    const entries = hashes.get(digest) ?? []
    entries.push(relativePath)
    hashes.set(digest, entries)
  }
}

for (const files of hashes.values()) {
  if (files.length > 1) {
    failures.push(`Exact duplicate source files:\n  - ${files.join('\n  - ')}`)
  }
}

if (failures.length > 0) {
  console.error('Repository hygiene check failed:\n')
  for (const failure of failures) console.error(`- ${failure}`)
  process.exit(1)
}

console.log(`Repository hygiene check passed (${allFiles.length} files scanned).`)
