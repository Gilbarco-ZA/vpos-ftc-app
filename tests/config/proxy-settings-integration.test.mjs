import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

const application = fs.readFileSync(
  'src/modules/proxy-settings/application/proxySettings.ts',
  'utf8',
)
const endpointResolver = fs.readFileSync(
  'src/modules/proxy-settings/infrastructure/resolveProxySettingsBaseUrl.ts',
  'utf8',
)
const route = fs.readFileSync(
  'app/api/admin/proxy-settings/route.ts',
  'utf8',
)
const form = fs.readFileSync(
  'app/(dashboard)/admin/proxy-settings/ProxySettingsForm.tsx',
  'utf8',
)

test('proxy settings use the live vpos-proxy settings endpoint', () => {
  assert.match(application, /const SETTINGS_PATH = '\/proxy\/settings'/)
  assert.doesNotMatch(application, /SETTINGS_PATH = '\/proxy\/health'/)
  assert.match(application, /method: 'PATCH'/)
})

test('proxy settings derive the endpoint from the configured DOMS host', () => {
  assert.match(endpointResolver, /getJplConfig/)
  assert.match(endpointResolver, /DEFAULT_PROXY_PORT = 5555/)
  assert.match(endpointResolver, /buildProxyBaseUrlFromDomsHost/)
  assert.match(endpointResolver, /env:VPOS_PROXY_URL/)
})

test('the admin route and form support the complete proxy settings contract', () => {
  assert.match(route, /'swaggerEndpointTanzania'/)
  assert.match(route, /'countryCode'/)
  assert.match(route, /'queueModules'/)
  assert.match(form, /Reload from vpos-proxy/)
  assert.match(form, /Save to vpos-proxy/)
  assert.match(form, /Tanzania swagger endpoint/)
  assert.match(form, /swaggerEndpointTanzania/)
  assert.match(application, /swaggerEndpointTanzania: string/)
  assert.match(application, /source\.swaggerEndpointTanzania/)
  assert.match(form, /Queue modules/)
  assert.match(form, /countryCode/)
})
