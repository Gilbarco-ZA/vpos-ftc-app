import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

const listener = fs.readFileSync(
  'src/modules/runtime/infrastructure/busListeners.ts',
  'utf8',
)
const policy = fs.readFileSync(
  'src/modules/archive/domain/runtimeArchivePolicy.ts',
  'utf8',
)

test('runtime listener never writes the full bus message to archive storage', () => {
  assert.match(listener, /buildCompactRuntimeArchivePayload\(msg, topic, messageType\)/)
  assert.doesNotMatch(listener, /payload:\s*msg[,\n]/)
})

test('compact archive policy documents prohibited full payload classes', () => {
  assert.match(policy, /Full message payloads/)
  assert.match(policy, /receipt bodies/)
  assert.match(policy, /fiscal responses/)
  assert.match(policy, /DOMS frames/)
})
