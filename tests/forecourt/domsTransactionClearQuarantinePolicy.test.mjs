import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const read = (path) => readFileSync(path, 'utf8')

const quarantine = read(
  'src/modules/forecourt/infrastructure/jpl/clearRejectQuarantine.ts',
)
const replay = read('src/modules/forecourt/infrastructure/jpl/replay.ts')
const recovery = read(
  'src/modules/forecourt/infrastructure/jpl/transactionRecovery.ts',
)
const lifecycle = read(
  'src/modules/forecourt/infrastructure/jpl/lifecycle.ts',
)
const refresh = read(
  'src/modules/forecourt/application/refreshDomsReplayAfterConfiguration.ts',
)
const support = read(
  'src/modules/forecourt/application/domsSupportBundle.ts',
)
const pssDiagnostics = read(
  'src/modules/forecourt/infrastructure/jpl/pssApplicationDiagnostics.ts',
)
const adapterHelpers = read(
  'src/modules/forecourt/infrastructure/adapters/jplTcpAdapter.helpers.ts',
)
const protocolRuntime = read(
  'src/platform/integrations/jpl/protocol/runtime.ts',
)

test('deterministic supervised Wrong rx_size clear rejects are quarantined fail-closed', () => {
  assert.match(quarantine, /RejectedExtendedMsgCode/)
  assert.match(quarantine, /rejectedExtendedMsgCode === '0031H'/)
  assert.match(quarantine, /rejectedMsgSubc === '04H'/)
  assert.match(quarantine, /rejectCode === '02H'/)
  assert.match(quarantine, /rejectInfo === '09H'/)
  assert.match(quarantine, /wrong rx_size/)
  assert.match(quarantine, /details\?\.raw\?\.data/)
  assert.match(replay, /details\?\.raw\?\.data/)
  assert.match(protocolRuntime, /details\?\.raw\?\.data/)
  assert.match(adapterHelpers, /rejectDetails/)
  assert.match(adapterHelpers, /rejectedExtendedMsgCode/)

  const quarantineCheck = replay.indexOf('getClearRejectQuarantineEntry({')
  const readMark = replay.indexOf("markBufferRead('supervised'")
  const clearRequest = replay.indexOf('await (client as any).request(clearRequest)')
  assert.ok(quarantineCheck >= 0)
  assert.ok(readMark > quarantineCheck)
  assert.ok(clearRequest > readMark)
  assert.match(replay, /quarantineDeterministicSupervisedClearReject\(\{/)
  assert.match(replay, /clearRetryQuarantined: Boolean\(quarantined\)/)
  assert.doesNotMatch(quarantine, /markBufferCleared/)
})

test('quarantine reset points require a new session, configuration refresh, or explicit live recovery', () => {
  assert.match(lifecycle, /resetClearRejectQuarantine\(stationId\)/)
  assert.match(refresh, /resetClearRejectQuarantine\(normalizedStationId\)/)
  assert.match(
    recovery,
    /!dryRun && \(input\.triggerSource \?\? 'manual_admin'\) === 'manual_admin'/,
  )
  assert.match(recovery, /resetClearRejectQuarantine\(stationId\)/)
  assert.match(recovery, /quarantineDeterministicSupervisedClearReject\(\{/)
})

test('JPL adapter startup is single-flight inside one FTC process', () => {
  assert.match(lifecycle, /globalThis\.__jplTcpStartPromise/)
  assert.match(lifecycle, /const startPromise = startJplTcpAdapterInternal\(\)/)
  assert.match(lifecycle, /await globalThis\.__jplTcpStartPromise/)
  assert.match(lifecycle, /globalThis\.__jplTcpStartPromise = undefined/)

  const wrapper = lifecycle.indexOf('export const startJplTcpAdapter = async () =>')
  const internal = lifecycle.indexOf('const startJplTcpAdapterInternal = async () =>')
  assert.ok(internal >= 0)
  assert.ok(wrapper > internal)
})

test('support bundle surfaces active clear failures and read-only PSS reference-length diagnostics', () => {
  assert.match(support, /activeCheckpointClearFailures/)
  assert.match(support, /failedClearCount/)
  assert.match(support, /clearRejectQuarantine:/)
  assert.match(support, /pssReferenceLengthDiagnostics/)

  assert.match(pssDiagnostics, /PSS_XML_KEYS\.RAW_XML/)
  assert.match(pssDiagnostics, /PSS_XML_KEYS\.LAST_IMPORT_CHECKSUM/)
  assert.match(pssDiagnostics, /MlenReferenceNo/i)
  assert.match(pssDiagnostics, /sourceChecksum/)
  assert.doesNotMatch(pssDiagnostics, /kvSet/)
})
