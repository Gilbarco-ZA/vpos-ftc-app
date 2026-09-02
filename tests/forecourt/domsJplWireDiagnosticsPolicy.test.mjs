import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const wire = readFileSync(
  new URL(
    '../../src/modules/forecourt/infrastructure/jpl/wireDiagnostics.ts',
    import.meta.url,
  ),
  'utf8',
)
const lifecycle = readFileSync(
  new URL(
    '../../src/modules/forecourt/infrastructure/jpl/lifecycle.ts',
    import.meta.url,
  ),
  'utf8',
)
const supportBundle = readFileSync(
  new URL(
    '../../src/modules/forecourt/application/domsSupportBundle.ts',
    import.meta.url,
  ),
  'utf8',
)
const state = readFileSync(
  new URL('../../src/shared/forecourt/jplState.ts', import.meta.url),
  'utf8',
)

test('JPL wire diagnostics capture actual socket frames for supervised transaction clear debugging', () => {
  assert.match(wire, /Socket\.prototype/)
  assert.match(wire, /clear_FpSupTrans_req/)
  assert.match(wire, /RejectMessage_resp/)
  assert.match(wire, /frameByteLength/)
  assert.match(wire, /jsonByteLength/)
  assert.match(wire, /frameHex/)
  assert.match(wire, /frameUtf8/)
  assert.match(wire, /remotePort/)
  assert.match(wire, /socket\.on\('data'/)
})

test('wire diagnostics preserve payment redaction and do not alter transaction payloads', () => {
  assert.match(wire, /redactJplSensitivePaymentData/)
  assert.match(wire, /Raw inbound transaction payload omitted/)
  assert.doesNotMatch(wire, /PaymentParameters\s*=/)
  assert.doesNotMatch(wire, /ReferenceNo\s*=/)
})

test('wire diagnostics are installed before vendor forecourt construction and exposed in support state', () => {
  const installAt = lifecycle.indexOf('installJplWireDiagnostics({')
  const createAt = lifecycle.indexOf('domsJpl.createForecourt({')
  assert.ok(installAt >= 0)
  assert.ok(createAt >= 0)
  assert.ok(installAt < createAt)
  assert.match(lifecycle, /wire:diagnostics_enabled/)
  assert.match(state, /lastWireDiagnostic\?: any/)
  assert.match(state, /wireDiagnostics\?: any\[\]/)
  assert.match(supportBundle, /lastWireDiagnostic:/)
  assert.match(supportBundle, /wireDiagnostics:/)
})
