import { readdir } from 'node:fs/promises'
import { relative, resolve, sep } from 'node:path'

const TEST_FILE_PATTERN = /\.(?:test|spec)\.(?:ts|tsx|mjs|cjs)$/

export const isTestFile = (filename) => TEST_FILE_PATTERN.test(filename)

export async function discoverTests(dir = 'tests') {
  const root = resolve(dir)
  const files = []

  async function walk(current) {
    const entries = await readdir(current, { withFileTypes: true })
    for (const entry of entries) {
      const fullPath = resolve(current, entry.name)
      if (entry.isDirectory()) {
        await walk(fullPath)
      } else if (entry.isFile() && isTestFile(entry.name)) {
        files.push(relative(process.cwd(), fullPath).split(sep).join('/'))
      }
    }
  }

  await walk(root)
  return files.sort((a, b) => a.localeCompare(b))
}

export function filterTests(tests, match) {
  if (!match) return tests
  const normalized = String(match).replaceAll('\\', '/')
  return tests.filter((testPath) => testPath.includes(normalized))
}
