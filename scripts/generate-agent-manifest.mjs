#!/usr/bin/env node

import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const ROOT = process.cwd()
const pkg = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8'))
const ignored = new Set(['.agent', '.git', '.next', 'build', 'coverage', 'node_modules', 'out'])

function walk(dir = ROOT) {
  const result = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory() && ignored.has(entry.name)) continue
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) result.push(...walk(fullPath))
    else result.push(path.relative(ROOT, fullPath).replaceAll(path.sep, '/'))
  }
  return result
}

const files = walk()
const manifest = {
  schemaVersion: 2,
  generatedAt: new Date().toISOString(),
  project: {
    name: pkg.name,
    version: pkg.version,
    node: pkg.engines?.node,
    framework: `Next.js ${pkg.dependencies?.next}`,
    language: 'TypeScript',
  },
  counts: {
    apiRoutes: files.filter((file) => /^app\/api\/.+\/route\.(ts|js)$/.test(file)).length,
    pages: files.filter((file) => /^app\/.+\/page\.(tsx|jsx)$/.test(file)).length,
    tests: files.filter((file) => /(^|\/)(tests\/|[^/]+\.(test|spec)\.)/.test(file)).length,
  },
  entrypoints: ['start.cjs', 'server.ts', 'scripts/worker.ts', 'server/index.ts', 'workers/'],
  authoritativeDocs: [
    'AGENTS.md',
    'README.md',
    'docs/README.md',
    'docs/architecture.md',
    'docs/configuration.md',
    'docs/development.md',
    'docs/testing.md',
  ],
  commands: {
    validate: 'npm run check',
    formatCheck: 'npm run format:check',
    lint: 'npm run lint',
    typecheck: 'npm run typecheck',
    tests: 'npm test',
    architecture: 'npm run check:architecture',
    hygiene: 'npm run check:hygiene',
    find: 'npm run agent:find -- <kind> <query>',
    dependencies: 'npm run agent:deps -- <path>',
    impact: 'npm run agent:impact -- <path>',
    relatedTests: 'npm run agent:tests -- <path>',
  },
  highRiskAreas: [
    'src/modules/forecourt/**',
    'src/modules/transactions/**/fiscalization/**',
    'src/platform/db/**',
    'src/platform/runtime/**',
    'app/api/setup/**',
    'app/api/admin/**',
    'scripts/migrations/**',
  ],
}

mkdirSync(path.join(ROOT, '.agent'), { recursive: true })
writeFileSync(path.join(ROOT, '.agent/manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`)
console.log('Generated .agent/manifest.json')
