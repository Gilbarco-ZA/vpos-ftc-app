import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const server = readFileSync('server.ts', 'utf8')
const launcher = readFileSync('start.cjs', 'utf8')
const serializer = readFileSync('src/shared/utils/serializeError.ts', 'utf8')
const tanzania = readFileSync(
  'src/modules/tanzania-fiscal/infrastructure/proxyDailyTotalsWorker.ts',
  'utf8',
)

test('runtime diagnostics expose memory, PostgreSQL pressure, and forecourt queue pressure', () => {
  assert.match(server, /\[diag\] runtime health/)
  assert.match(server, /getPostgresPoolDiagnostics/)
  assert.match(server, /getJplPersistenceQueueDiagnostics/)
  assert.match(server, /getJplEventProcessingQueueDiagnostics/)
  assert.match(server, /getForecourtMaterializationQueueDiagnostics/)
  assert.match(server, /memoryMb/)
})

test('launcher signal diagnostics include actual signal, pid, and memory', () => {
  assert.match(launcher, /received \$\{sig\}/)
  assert.match(launcher, /pid=\$\{process\.pid\}/)
  assert.match(launcher, /heap_used_mb=/)
  assert.doesNotMatch(launcher, /received  \(pid=\)/)
})

test('structured errors survive JSON logging and Tanzania configuration noise is rate-limited', () => {
  assert.match(serializer, /export function serializeError/)
  assert.match(serializer, /stack:/)
  assert.match(serializer, /code:/)
  assert.match(tanzania, /CONFIG_WARNING_INTERVAL_MS/)
  assert.match(tanzania, /configuration required/)
  assert.match(tanzania, /__vposTanzaniaDailyTotalsWorkerController/)
})
