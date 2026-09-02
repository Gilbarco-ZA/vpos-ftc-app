import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const client = readFileSync(
  'app/(dashboard)/admin/forecourt/client.tsx',
  'utf8',
)
const deferred = readFileSync(
  'components/admin/forecourt/DeferredForecourtPanel.tsx',
  'utf8',
)
const commissioning = readFileSync(
  'components/admin/forecourt/JplCommissioningReadinessPanel.tsx',
  'utf8',
)
const sharedState = readFileSync('src/shared/forecourt/sharedState.ts', 'utf8')
const jplState = readFileSync('src/shared/forecourt/jplState.ts', 'utf8')
const forecourtAdmin = readFileSync(
  'src/modules/forecourt/application/forecourtAdmin.ts',
  'utf8',
)
const supportBundle = readFileSync(
  'src/modules/forecourt/application/domsSupportBundle.ts',
  'utf8',
)
const server = readFileSync('server.ts', 'utf8')
const adminEvents = readFileSync(
  'src/modules/forecourt/application/listAdminForecourtEvents.ts',
  'utf8',
)

test('heavy forecourt panels load only on explicit operator request', () => {
  assert.match(deferred, /Load \{label\}/)
  assert.match(deferred, /setMounted\(true\)/)
  assert.doesNotMatch(deferred, /IntersectionObserver/)
  assert.doesNotMatch(deferred, /rootMargin/)
  assert.match(client, /<DeferredForecourtPanel label="JPL diagnostics">/)
  assert.match(client, /<DeferredForecourtPanel label="Support bundle">/)
  assert.match(commissioning, /label="Operational readiness"/)
})

test('routine forecourt state stays compact while support bundles retain full diagnostics', () => {
  assert.match(sharedState, /compactForecourtAdapterStateForPersistence/)
  assert.match(sharedState, /value: compactState/)
  assert.match(jplState, /export function summarizeJplAdapterState/)
  assert.match(forecourtAdmin, /summarizeJplAdapterState\(getJplAdapterState\(\)\)/)
  assert.match(forecourtAdmin, /getForecourtAdapterRuntimeDiagnostics/)
  assert.match(supportBundle, /getForecourtAdapterRuntimeDiagnostics\(\)/)
  assert.match(server, /getJplTcpAdapterStateSummary\(\)/)
})

test('forecourt event page and API use bounded audit defaults', () => {
  assert.match(client, /useState<number>\(50\)/)
  assert.match(client, /Math\.min\(200, Number\(e\.target\.value \|\| 0\)\)/)
  assert.match(adminEvents, /const limit = Math\.min\(\s*200,/)
  assert.match(adminEvents, /searchParams\.get\('limit'\) \|\| 50/)
})
