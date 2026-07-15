import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const appDir = path.join(root, 'app')
const baselinePath = path.join(root, '.agent', 'page-boundary-baseline.json')
const bannedPatterns = [
  /@\/src\/platform\/db\//,
  /@\/src\/modules\/[^'"\n]+\/infrastructure\//,
  /@\/src\/[^'"\n]+\/(?:repositories|repository)\//,
]

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name)
    return entry.isDirectory() ? walk(full) : [full]
  })
}

function collectViolations() {
  return walk(appDir)
    .filter((file) => file.endsWith(`${path.sep}page.tsx`))
    .flatMap((file) => {
      const source = fs.readFileSync(file, 'utf8')
      const imports = [...source.matchAll(/from\s+['"]([^'"]+)['"]/g)].map(
        (match) => match[1],
      )
      return imports
        .filter((value) => bannedPatterns.some((pattern) => pattern.test(value)))
        .map((value) => `${path.relative(root, file).replaceAll('\\', '/')} -> ${value}`)
    })
    .sort()
}

const current = collectViolations()
const baseline = fs.existsSync(baselinePath)
  ? JSON.parse(fs.readFileSync(baselinePath, 'utf8'))
  : []
const additions = current.filter((item) => !baseline.includes(item))

if (additions.length) {
  console.error('New page boundary violations detected:')
  for (const item of additions) console.error(`- ${item}`)
  process.exit(1)
}

console.log(
  `Page boundary check passed (${current.length} known violation${current.length === 1 ? '' : 's'} remaining).`,
)
