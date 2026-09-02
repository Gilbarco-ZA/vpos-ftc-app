import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildTanzaniaEwuraProxyRegistrationPayload,
  buildTanzaniaTraProxyRegistrationPayload,
  isTanzaniaRegistrationResponseSuccess,
} from '../../src/modules/tanzania-fiscal/domain/proxyRegistration'
import {
  submitTanzaniaEwuraRegistrationViaProxy,
  submitTanzaniaTraRegistrationViaProxy,
} from '../../src/shared/proxy/client'

test('builds the exact TRA registration payload expected by vpos-proxy', () => {
  const payload = buildTanzaniaTraProxyRegistrationPayload({
    input: {
      tin: '100000000',
      serialNumber: 'TEST-SERIAL-01',
      certSerial: 'Q0VSVF9TRVJJQUw=',
      privateKeyBase64: 'UFJJVkFURV9LRVk=',
      publicKeyBase64: 'UFVCTElDX0tFWQ==',
      password: 'test-password',
      licenseKey: 'TEST-LICENSE-KEY',
    },
  })

  assert.deepEqual(payload, {
    tin: '100000000',
    serialNumber: 'TEST-SERIAL-01',
    certSerial: 'Q0VSVF9TRVJJQUw=',
    privateKeyBase64: 'UFJJVkFURV9LRVk=',
    publicKeyBase64: 'UFVCTElDX0tFWQ==',
    password: 'test-password',
    licenseKey: 'TEST-LICENSE-KEY',
  })
})

test('rejects malformed TRA key material before contacting vpos-proxy', () => {
  assert.throws(
    () =>
      buildTanzaniaTraProxyRegistrationPayload({
        input: {
          tin: '100000000',
          serialNumber: 'TEST-SERIAL-01',
          certSerial: 'not base64',
          privateKeyBase64: 'UFJJVkFURV9LRVk=',
          publicKeyBase64: 'UFVCTElDX0tFWQ==',
          password: 'test-password',
          licenseKey: 'TEST-LICENSE-KEY',
        },
      }),
    /TRA certificate serial must be Base64 encoded/,
  )
})

test('builds the exact EWURA registration payload expected by vpos-proxy', () => {
  const payload = buildTanzaniaEwuraProxyRegistrationPayload({
    retailStationName: 'TEST RETAIL STATION',
    ewuraLicenseNo: 'PRL-TEST-001',
    regionName: 'Test Region',
    districtName: 'Test District',
    wardName: 'Test Ward',
    zone: 'TEST ZONE',
    contactPersonEmailAddress: 'test@example.invalid',
    contactPersonPhone: '0000000000',
  })

  assert.deepEqual(payload, {
    retailStationName: 'TEST RETAIL STATION',
    ewuraLicenseNo: 'PRL-TEST-001',
    regionName: 'Test Region',
    districtName: 'Test District',
    wardName: 'Test Ward',
    zone: 'TEST ZONE',
    contactPersonEmailAddress: 'test@example.invalid',
    contactPersonPhone: '0000000000',
  })
})

test('treats the OpenAPI registration error flag as a business failure even on HTTP 200', () => {
  assert.equal(
    isTanzaniaRegistrationResponseSuccess({
      responseCode: '400',
      message: 'Registration rejected',
      error: true,
      status: 'FAILED',
    }),
    false,
  )
  assert.equal(
    isTanzaniaRegistrationResponseSuccess({
      responseCode: '200',
      message: 'Registration accepted',
      error: false,
      status: 'SUCCESS',
    }),
    true,
  )
})

test('posts TRA and EWURA registrations to separate Tanzania proxy endpoints', async () => {
  const originalFetch = globalThis.fetch
  const originalProxyUrl = process.env.VPOS_PROXY_URL
  const calls: Array<{ url: string; init?: RequestInit }> = []

  process.env.VPOS_PROXY_URL = 'http://127.0.0.1:5555'
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(input), init })
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  }) as typeof fetch

  try {
    await submitTanzaniaTraRegistrationViaProxy(undefined, {
      tin: '100000000',
      serialNumber: 'TEST-SERIAL-01',
      certSerial: 'Q0VSVF9TRVJJQUw=',
      privateKeyBase64: 'UFJJVkFURV9LRVk=',
      publicKeyBase64: 'UFVCTElDX0tFWQ==',
      password: 'test-password',
      licenseKey: 'TEST-LICENSE-KEY',
    })
    await submitTanzaniaEwuraRegistrationViaProxy(undefined, {
      retailStationName: 'TEST RETAIL STATION',
      ewuraLicenseNo: 'PRL-TEST-001',
      regionName: 'Test Region',
      districtName: 'Test District',
      wardName: 'Test Ward',
      zone: 'TEST ZONE',
      contactPersonEmailAddress: 'test@example.invalid',
      contactPersonPhone: '0000000000',
    })
  } finally {
    globalThis.fetch = originalFetch
    if (originalProxyUrl === undefined) delete process.env.VPOS_PROXY_URL
    else process.env.VPOS_PROXY_URL = originalProxyUrl
  }

  assert.equal(calls.length, 2)
  assert.equal(calls[0]?.url, 'http://127.0.0.1:5555/api/tanzania/registrations/tra')
  assert.equal(calls[1]?.url, 'http://127.0.0.1:5555/api/tanzania/registrations/ewura')
  assert.equal(calls[0]?.init?.method, 'POST')
  assert.equal(calls[1]?.init?.method, 'POST')
  assert.deepEqual(JSON.parse(String(calls[0]?.init?.body)), {
    tin: '100000000',
    serialNumber: 'TEST-SERIAL-01',
    certSerial: 'Q0VSVF9TRVJJQUw=',
    privateKeyBase64: 'UFJJVkFURV9LRVk=',
    publicKeyBase64: 'UFVCTElDX0tFWQ==',
    password: 'test-password',
    licenseKey: 'TEST-LICENSE-KEY',
  })
  assert.deepEqual(JSON.parse(String(calls[1]?.init?.body)), {
    retailStationName: 'TEST RETAIL STATION',
    ewuraLicenseNo: 'PRL-TEST-001',
    regionName: 'Test Region',
    districtName: 'Test District',
    wardName: 'Test Ward',
    zone: 'TEST ZONE',
    contactPersonEmailAddress: 'test@example.invalid',
    contactPersonPhone: '0000000000',
  })
})
