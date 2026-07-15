import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'

const appDir = path.resolve('app')
const sidebarPath = path.resolve('components/layout/sidebar.tsx')

const collectPageRoutes = async (
  directory: string,
  segments: string[] = [],
): Promise<string[]> => {
  const entries = await readdir(directory, { withFileTypes: true })
  const routes: string[] = []

  for (const entry of entries) {
    if (entry.isDirectory()) {
      const nextSegments =
        entry.name.startsWith('(') && entry.name.endsWith(')')
          ? segments
          : [...segments, entry.name]
      routes.push(
        ...(await collectPageRoutes(
          path.join(directory, entry.name),
          nextSegments,
        )),
      )
      continue
    }

    if (entry.name !== 'page.tsx') continue
    if (segments.some((segment) => segment.startsWith('['))) continue
    routes.push(`/${segments.join('/')}` || '/')
  }

  return routes
}

test('administrator navigation links every static dashboard page', async () => {
  const [routes, sidebarSource] = await Promise.all([
    collectPageRoutes(appDir),
    readFile(sidebarPath, 'utf8'),
  ])

  const linkedRoutes = new Set(
    Array.from(sidebarSource.matchAll(/href: '([^']+)'/g), (match) =>
      match[1].split('?')[0],
    ),
  )
  const nonDashboardRoutes = new Set([
    '/',
    '/login',
    '/logout',
    '/setup',
    '/startup',
  ])
  const missingRoutes = routes
    .filter((route) => !nonDashboardRoutes.has(route))
    .filter((route) => !linkedRoutes.has(route))
    .sort()

  assert.deepEqual(missingRoutes, [])
})
