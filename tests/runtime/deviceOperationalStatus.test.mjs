import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

const read = (path) => fs.readFileSync(path, 'utf8')

test('device status uses canonical proxy, internet and printer health signals', () => {
  const application = read(
    'src/modules/setup/application/getDeviceOperationalStatus.ts',
  )
  const page = read('components/admin/device/DeviceStatusPanel.tsx')

  assert.match(application, /path: '\/proxy\/health'/)
  assert.match(application, /connectivity\.internet/)
  assert.match(application, /connectivity\.network/)
  assert.match(application, /printerConnectivityWorker/)
  assert.match(application, /configuredCount/)
  assert.match(application, /connectedCount/)

  assert.match(page, /label="Internet"/)
  assert.match(page, /label="VPOS Proxy"/)
  assert.match(page, /label="Printer"/)
  assert.doesNotMatch(page, /navigator\.onLine/)
  assert.doesNotMatch(page, /Local network connection available/)
})

test('device status surfaces expired fiscal license evidence', () => {
  const application = read(
    'src/modules/setup/application/getDeviceOperationalStatus.ts',
  )
  const route = read('app/api/admin/device/registration/route.ts')
  const page = read('components/admin/device/DeviceStatusPanel.tsx')

  assert.match(application, /current\\s\+status/)
  assert.match(application, /'EXPIRED'/)
  assert.match(application, /getLatestProxyFiscalizationSignal/)
  assert.match(route, /operationalStatus/)
  assert.match(page, /Registration & licence/)
  assert.match(page, /Licence status/)
  assert.match(page, /Licence expiry/)
  assert.match(page, /Licence expired/)
})

test('device status refresh performs one status request', () => {
  const page = read('components/admin/device/DeviceStatusPanel.tsx')
  const matches = page.match(/fetch\('\/api\/admin\/device\/registration'/g) ?? []

  assert.equal(matches.length, 2)
  assert.match(page, /const loadDeviceStatus = useCallback/)
  assert.doesNotMatch(page, /const loadRegistration = useCallback/)
})
