import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

const read = (path) => fs.readFileSync(path, 'utf8')

test('Tanzania setup separates TRA and EWURA proxy registrations', () => {
  const component = read('components/admin/TanzaniaProxyRegistrationClient.tsx')
  const setupRoute = read('app/api/setup/tanzania-fiscal/route.ts')
  const proxyClient = read('src/shared/proxy/client.ts')

  assert.match(component, /TRA registration details/)
  assert.match(component, /EWURA registration details/)
  assert.match(component, /register-tra/)
  assert.match(component, /register-ewura/)
  assert.match(setupRoute, /submitTanzaniaTraRegistration/)
  const setupClient = read('app/setup/client.tsx')
  assert.match(setupClient, /UNITED REPUBLIC OF TANZANIA/)
  assert.match(setupRoute, /submitTanzaniaEwuraRegistration/)
  assert.match(setupRoute, /csrf: true/)
  assert.match(proxyClient, /\/api\/tanzania\/registrations\/tra/)
  assert.match(proxyClient, /\/api\/tanzania\/registrations\/ewura/)
})

test('TRA setup captures a PKCS#12 upload and derives the proxy key-material contract server-side', () => {
  const component = read('components/admin/TanzaniaProxyRegistrationClient.tsx')
  const service = read('src/modules/tanzania-fiscal/application/proxyRegistration.ts')

  assert.match(component, /type="file"/)
  assert.match(component, /accept="\.pfx,\.p12,application\/x-pkcs12"/)
  assert.match(component, /reader\.readAsDataURL\(file\)/)
  assert.match(component, /certificateBase64,/)
  assert.match(component, /certificatePassphrase,/)
  assert.doesNotMatch(component, /Certificate serial \(Base64\)/)
  assert.doesNotMatch(component, /Private key \(Base64\)/)
  assert.doesNotMatch(component, /Public key \(Base64\)/)

  assert.match(service, /certificateBase64\?: unknown/)
  assert.match(service, /await importTraPkcs12\(/)
  assert.match(service, /certSerial: imported\.proxyCertSerialBase64/)
  assert.match(service, /privateKeyBase64: imported\.privateKeyBase64/)
  assert.match(service, /publicKeyBase64: imported\.publicKeyBase64/)
})

test('direct TRA proxy key material remains available only as compatibility fallback', () => {
  const service = read('src/modules/tanzania-fiscal/application/proxyRegistration.ts')

  assert.match(service, /const directKeyMaterial = \{/)
  assert.match(service, /certSerial: clean\(input\.certSerial\)/)
  assert.match(service, /privateKeyBase64: clean\(input\.privateKeyBase64\)/)
  assert.match(service, /publicKeyBase64: clean\(input\.publicKeyBase64\)/)
})

test('TRA PKCS#12 import is used when direct compatibility key material is absent', () => {
  const service = read('src/modules/tanzania-fiscal/application/proxyRegistration.ts')
  const pkcs12 = read('src/modules/tanzania-fiscal/infrastructure/pkcs12.ts')

  assert.match(service, /!hasDirectKeyMaterial && certificateBase64/)
  assert.match(service, /importTraPkcs12/)
  assert.match(pkcs12, /type: 'pkcs8'/)
  assert.match(pkcs12, /type: 'spki'/)
})

test('proxy registration failures preserve sanitized upstream status and message', () => {
  const service = read('src/modules/tanzania-fiscal/application/proxyRegistration.ts')

  assert.match(service, /return new AppError\(code, message, status/)
  assert.match(service, /upstreamStatus:/)
  assert.match(service, /upstreamResponse: redactForStorage\(args\.data\)/)
  assert.match(service, /throw proxyFailure\(\{ label: 'EWURA'/)
  assert.match(service, /isTanzaniaRegistrationResponseSuccess/)
  assert.match(service, /result\.ok && isTanzaniaRegistrationResponseSuccess\(data\)/)
  assert.match(service, /data\?\.revenueAuthorityMessage/)
  assert.match(service, /data\?\.details\?\.middlewareMessage/)
})

test('Tanzania proxy registration uses registered station-KV keys with legacy read compatibility', () => {
  const service = read('src/modules/tanzania-fiscal/application/proxyRegistration.ts')

  assert.match(service, /proxy\.tanzania\.registration\.config/)
  assert.match(service, /LEGACY_CONFIG_KEY/)
  assert.match(service, /LEGACY_TRA_RESULT_KEY/)
  assert.match(service, /LEGACY_EWURA_RESULT_KEY/)
  assert.match(service, /certSerial: undefined/)
  assert.match(service, /privateKeyBase64: undefined/)
  assert.match(service, /publicKeyBase64: undefined/)
  assert.match(service, /payload\.certificateKey \?\? payload\.certKey/)
})
