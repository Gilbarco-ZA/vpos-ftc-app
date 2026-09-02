#!/usr/bin/env node

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'

const ROOT = process.cwd()
const roots = ['app', 'components', 'scripts', 'server', 'src', 'tests', 'workers']
const extensions = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']
const ignored = new Set(['.git', '.next', 'build', 'coverage', 'node_modules', 'out'])

function walk(dir) {
  if (!existsSync(dir)) return []
  const output = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory() && ignored.has(entry.name)) continue
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) output.push(...walk(fullPath))
    else if (extensions.includes(path.extname(entry.name))) output.push(fullPath)
  }
  return output
}

const files = roots.flatMap((root) => walk(path.join(ROOT, root)))
const relative = (file) => path.relative(ROOT, file).replaceAll(path.sep, '/')

function resolveImport(fromFile, specifier) {
  let candidate
  if (specifier.startsWith('@/')) candidate = path.join(ROOT, specifier.slice(2))
  else if (specifier.startsWith('.')) candidate = path.resolve(path.dirname(fromFile), specifier)
  else return null

  const attempts = [
    candidate,
    ...extensions.map((extension) => `${candidate}${extension}`),
    ...extensions.map((extension) => path.join(candidate, `index${extension}`)),
  ]
  const resolved = attempts.find((attempt) => existsSync(attempt) && statSync(attempt).isFile())
  return resolved ? relative(resolved) : null
}

function importsFor(file) {
  const text = readFileSync(file, 'utf8')
  const imports = new Set()
  const pattern = /(?:import|export)\s+(?:type\s+)?(?:[^'";]*?\s+from\s+)?['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/g
  let match
  while ((match = pattern.exec(text)) !== null) {
    const resolved = resolveImport(file, match[1] ?? match[2])
    if (resolved) imports.add(resolved)
  }
  return [...imports].sort()
}

function targetFiles(input) {
  const normalized = input.replaceAll('\\', '/').replace(/^\.\//, '')
  const absolute = path.resolve(ROOT, normalized)
  if (existsSync(absolute) && statSync(absolute).isFile()) return [absolute]
  if (existsSync(absolute) && statSync(absolute).isDirectory()) return walk(absolute)
  return files.filter((file) => relative(file).includes(normalized))
}

function find(kind, query) {
  const q = query.toLowerCase()
  const matches = files.filter((file) => {
    const rel = relative(file)
    if (kind === 'route' && !/\/route\.(ts|js)$/.test(rel)) return false
    if (kind === 'page' && !/\/page\.(tsx|jsx)$/.test(rel)) return false
    if (kind === 'test' && !/(^tests\/|\.(test|spec)\.)/.test(rel)) return false
    return rel.toLowerCase().includes(q) || readFileSync(file, 'utf8').toLowerCase().includes(q)
  })
  for (const file of matches.slice(0, 100)) console.log(relative(file))
  if (matches.length > 100) console.log(`... ${matches.length - 100} additional matches`)
}

function deps(input) {
  const matches = targetFiles(input)
  for (const file of matches.slice(0, 100)) {
    const dependencies = importsFor(file)
    if (dependencies.length === 0) continue
    console.log(relative(file))
    for (const dependency of dependencies) console.log(`  -> ${dependency}`)
  }
}

function impact(input) {
  const targets = new Set(targetFiles(input).map(relative))
  if (targets.size === 0) return
  for (const file of files) {
    const dependencies = importsFor(file)
    const matches = dependencies.filter((dependency) => targets.has(dependency))
    if (matches.length > 0) console.log(`${relative(file)} -> ${matches.join(', ')}`)
  }
}

function tests(input) {
  const matches = targetFiles(input).map(relative)
  const tokens = new Set(
    matches.flatMap((file) =>
      file
        .replace(/\.(test|spec)?\.(ts|tsx|js|jsx)$/, '')
        .split(/[\/._-]/)
        .filter((token) => token.length >= 4 && !['application', 'infrastructure', 'modules', 'shared'].includes(token)),
    ),
  )
  const scored = files
    .filter((file) => /(^tests\/|\.(test|spec)\.)/.test(relative(file)))
    .map((file) => {
      const rel = relative(file).toLowerCase()
      const score = [...tokens].reduce((total, token) => total + (rel.includes(token.toLowerCase()) ? 1 : 0), 0)
      return { file: relative(file), score }
    })
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score || a.file.localeCompare(b.file))
  for (const item of scored.slice(0, 40)) console.log(`${item.file} (score ${item.score})`)
}

const [command, first, ...rest] = process.argv.slice(2)
if (command === 'find') find(first || 'all', rest.join(' '))
else if (command === 'deps') deps([first, ...rest].filter(Boolean).join(' '))
else if (command === 'impact') impact([first, ...rest].filter(Boolean).join(' '))
else if (command === 'tests') tests([first, ...rest].filter(Boolean).join(' '))
else {
  console.error('Usage: agent-context.mjs <find|deps|impact|tests> ...')
  process.exit(1)
}
