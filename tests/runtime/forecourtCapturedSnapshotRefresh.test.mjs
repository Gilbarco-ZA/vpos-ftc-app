import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const sync = readFileSync('src/modules/forecourt/infrastructure/configSync/service.ts', 'utf8')
const maintenance = readFileSync('app/(dashboard)/admin/maintenance/MaintenanceClient.tsx', 'utf8')

test('JPL forecourt refresh uses recorded reconciliation evidence rather than a snapshotPath command', () => {
  const branch = sync.slice(sync.indexOf("if (cfg.source === 'jpl') {"), sync.indexOf("if (cfg.source === 'file' && !cfg.snapshotFile)"))
  assert.ok(branch.length > 0)
  assert.match(branch, /getDomsConfigurationReconciliation/)
  assert.match(branch, /installStatusSeenAt/)
  assert.match(branch, /latestRuntimeStateCount/)
  assert.match(branch, /configuredPumps/)
  assert.match(branch, /configuredTanks/)
  assert.match(branch, /configuredNozzles/)
  assert.match(branch, /kvSet\(params\.stationId, STATUS_KEY, status\)/)
  assert.doesNotMatch(branch, /snapshotPath|readSnapshotFromDomsJson|applySnapshot/)
})

test('maintenance refresh requests updated status after successful action', () => {
  assert.match(maintenance, /ForecourtSyncButton onComplete=\{refreshStatus\}/)
})
