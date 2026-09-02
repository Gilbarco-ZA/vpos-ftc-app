import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const proxySender = readFileSync(
  'src/modules/transactions/infrastructure/fiscalization/proxySenderWorker.ts',
  'utf8',
)
const dailyTotals = readFileSync(
  'src/modules/tanzania-fiscal/infrastructure/proxyDailyTotalsWorker.ts',
  'utf8',
)
const jplLogging = readFileSync(
  'src/modules/forecourt/infrastructure/jpl/logging.ts',
  'utf8',
)
const jplReplay = readFileSync(
  'src/modules/forecourt/infrastructure/jpl/replay.ts',
  'utf8',
)
const setupPage = readFileSync('app/(dashboard)/admin/setup/page.tsx', 'utf8')
const server = readFileSync('server.ts', 'utf8')

test('proxy reconciliation ignores transactions that are actively being submitted', () => {
  assert.match(proxySender, /excludeTransactionIds\?: ReadonlySet<string>/)
  assert.match(proxySender, /excludeTransactionIds: new Set\(inFlight\.keys\(\)\)/)
  assert.match(proxySender, /!input\.excludeTransactionIds\?\.has\(String\(row\.id\)\)/)
})

test('expected fresh-install configuration states do not pollute warning logs', () => {
  assert.match(dailyTotals, /logger\.info\(`\[\$\{WORKER_NAME\}\] configuration required`/)
  assert.match(dailyTotals, /status: configurationBlocked \? 'waiting_configuration' : 'degraded'/)
  assert.match(dailyTotals, /lastError: configurationBlocked \? null : message/)
  assert.match(jplReplay, /logger\.info\('\[jplTcp\] startup reconciliation skipped: no configured pumps'\)/)
})

test('JPL traffic logging suppresses heartbeat noise in both directions', () => {
  assert.match(jplLogging, /eventText\.includes\('heartbeat'\)/)
  assert.doesNotMatch(jplLogging, /direction !== 'recv'/)
})

test('setup printer action links directly to printer configuration', () => {
  assert.match(setupPage, /href="\/admin\/config\/printers">Configure printer/)
})

test('legacy startup import logs the warning details instead of only a count', () => {
  assert.match(server, /\[startup-import\] import warnings recorded/)
  assert.match(server, /warnings: res\.warnings\.slice\(0, 20\)/)
  assert.match(server, /truncated: res\.warnings\.length > 20/)
})
