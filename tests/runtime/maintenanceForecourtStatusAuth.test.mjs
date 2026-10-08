import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

test('administrator maintenance resolves forecourt status without an unauthenticated server HTTP fetch', () => {
  const page = readFileSync('app/(dashboard)/admin/maintenance/page.tsx', 'utf8')
  assert.match(page, /requireAuth\(\['administrator'\]\)/)
  assert.match(page, /getAdminForecourtSyncStatus\(user\.stationId\)/)
  assert.doesNotMatch(page, /api\('\/api\/admin\/forecourt-sync\/status'\)/)
  assert.match(page, /data: await getAdminForecourtSyncStatus/)
})
