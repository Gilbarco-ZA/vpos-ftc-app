import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

const read = (path) => fs.readFileSync(path, 'utf8')

test('logout always clears the session and browser form posts redirect to login', () => {
  const logout = read('app/api/auth/logout/route.ts')

  assert.match(logout, /getCurrentUser\(\)\.catch\(\(\) => null\)/)
  assert.match(logout, /deleteSession\(token\)\.catch\(\(\) => \{\}\)/)
  assert.match(logout, /clearSessionCookie\(\)/)
  assert.match(logout, /NextResponse\.redirect\(resolveLogoutRedirectTarget\(req\)/)
  assert.match(logout, /status: 303/)
  assert.doesNotMatch(logout, /defineMutationRoute/)
})

test('dashboard redirects to login when the session expires', () => {
  const guard = read('components/layout/StationConfigGuard.tsx')

  assert.match(guard, /fetch\('\/api\/auth\/session'/)
  assert.match(guard, /router\.replace\('\/login'\)/)
  assert.match(guard, /SESSION_CHECK_INTERVAL_MS = 60_000/)
  assert.match(guard, /window\.addEventListener\('focus'/)
  assert.match(guard, /visibilitychange/)
})

test('Tanzania customer capture only requests name and PIN or TIN', () => {
  const drawer = read('components/customers/CustomerDrawer.tsx')

  assert.match(drawer, /isTanzaniaStation/)
  assert.match(drawer, /label=\{isTanzania \? 'Name' : 'Buyer name'\}/)
  assert.match(drawer, /label=\{isTanzania \? 'PIN\/TIN' : 'TIN'\}/)
  assert.match(drawer, /pin: normalizedTin/)
  assert.match(drawer, /country: countryCode \|\| 'TZ'/)
  assert.match(drawer, /addressCountryCode: countryCode \|\| 'TZ'/)
  assert.match(drawer, /!isTanzania \? \(/)
  assert.match(drawer, /Vehicle & payment defaults/)
  assert.match(drawer, /Contact/)
  assert.match(drawer, /Address/)
})
