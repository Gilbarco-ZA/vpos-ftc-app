import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

test('administrator maintenance forwards the user session to the protected forecourt status API', () => {
  const page = readFileSync('app/(dashboard)/admin/maintenance/page.tsx', 'utf8')
  assert.match(page, /requireAuth\(\['administrator'\]\)/)
  assert.match(page, /import \{ headers \} from 'next\/headers'/)
  assert.match(page, /\(await headers\(\)\)\.get\('cookie'\)/)
  assert.match(page, /api\('\/api\/admin\/forecourt-sync\/status', \{/)
  assert.match(page, /headers: \{ cookie: cookieHeader \}/)
  assert.match(page, /cache: 'no-store'/)
  assert.doesNotMatch(page, /getAdminForecourtSyncStatus/)
})
