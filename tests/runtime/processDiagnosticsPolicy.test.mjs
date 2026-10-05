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
const pssXmlWorker = readFileSync(
  'src/platform/integrations/pssXml/watcherWorker.ts',
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

test('launcher keeps VPOS alive for a transient PostgreSQL connection drop', () => {
  assert.match(launcher, /isRecoverablePostgresTransportError/)
  assert.match(launcher, /connection terminated unexpectedly/i)
  assert.match(launcher, /PostgreSQL connection dropped; keeping process alive/)
})

test('launcher treats PostgreSQL pool pressure as recoverable process noise', () => {
  assert.match(launcher, /timeout expired/)
  assert.match(launcher, /remaining connection slots/)
  assert.match(launcher, /too many clients/)
  assert.match(launcher, /connection terminated due to connection timeout/)
  assert.match(launcher, /ECONNRESET/)
  assert.match(launcher, /EPIPE/)
  assert.match(launcher, /socket hang up/)
  assert.match(launcher, /code === '57P03'/)
})

test('launcher also survives transient PostgreSQL unhandled rejections', () => {
  assert.match(launcher, /PostgreSQL connection dropped in unhandled rejection/)
  assert.match(
    launcher,
    /process\.on\('unhandledRejection'[\s\S]*isRecoverablePostgresTransportError\(reason\)/,
  )
})

test('PSS XML polling contains transient database failures inside the worker', () => {
  assert.match(pssXmlWorker, /tick failed; will retry on next poll/)
  assert.match(pssXmlWorker, /catch \(e: any\)[\s\S]*finally/)
})

test('structured errors survive JSON logging and Tanzania configuration noise is rate-limited', () => {
  assert.match(serializer, /export function serializeError/)
  assert.match(serializer, /stack:/)
  assert.match(serializer, /code:/)
  assert.match(tanzania, /CONFIG_WARNING_INTERVAL_MS/)
  assert.match(tanzania, /configuration required/)
  assert.match(tanzania, /__vposTanzaniaDailyTotalsWorkerController/)
})
