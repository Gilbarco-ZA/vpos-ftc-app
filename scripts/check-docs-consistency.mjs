#!/usr/bin/env node

import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'

const ROOT = process.cwd()
const pkg = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8'))
const read = (file) => readFileSync(path.join(ROOT, file), 'utf8')
const failures = []

const readme = read('README.md')
for (const [label, value] of [
  ['Next.js', pkg.dependencies.next],
  ['React', pkg.dependencies.react],
  ['Node engine', pkg.engines.node],
]) {
  if (!readme.includes(value)) failures.push(`README does not mention current ${label} value: ${value}`)
}

for (const command of ['npm run format:check', 'npm run lint', 'npm run typecheck', 'npm test']) {
  if (!readme.includes(command)) failures.push(`README does not document validation command: ${command}`)
}

const authoritativeDocs = [
  'AGENTS.md',
  'CONTRIBUTING.md',
  'docs/README.md',
  'docs/architecture.md',
  'docs/configuration.md',
  'docs/development.md',
  'docs/startup-flow.md',
  'docs/testing.md',
]

const markdownLink = /\[[^\]]*\]\(([^)]+)\)/g
for (const file of authoritativeDocs) {
  if (!existsSync(path.join(ROOT, file))) {
    failures.push(`Missing authoritative document: ${file}`)
    continue
  }
  const content = read(file)
  let match
  while ((match = markdownLink.exec(content)) !== null) {
    const href = match[1].trim()
    if (!href || href.startsWith('#') || /^[a-z]+:/i.test(href)) continue
    const target = href.split('#', 1)[0]
    const resolved = path.resolve(ROOT, path.dirname(file), target)
    if (!existsSync(resolved)) failures.push(`Broken link in ${file}: ${href}`)
  }
}

if (failures.length > 0) {
  console.error('Documentation consistency check failed:\n')
  for (const failure of failures) console.error(`- ${failure}`)
  process.exit(1)
}

console.log('Documentation consistency check passed.')
