import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

const read = (path) => fs.readFileSync(path, 'utf8')

test('station storage retention overrides environment-only controls', () => {
  const policy = read('src/platform/retention/storageRetentionPolicy.ts')
  assert.match(policy, /STORAGE_RETENTION_SETTINGS_KEY = 'vpos\.storageRetention'/)
  assert.match(policy, /getStationStorageRetentionPolicy/)
  assert.match(policy, /saveStationStorageRetentionPolicy/)
  assert.match(policy, /VPOS_RETENTION_ENABLED/)
  assert.match(policy, /VPOS_RETENTION_DRY_RUN/)
  assert.match(policy, /printTestDoneDays/)
})

test('runtime polls station retention settings without restart', () => {
  const worker = read('src/platform/retention/stationStorageRetention.ts')
  const supervisor = read('src/modules/runtime/infrastructure/supervisorMonitorWorker.ts')
  assert.match(worker, /POLICY_REFRESH_MS = 60_000/)
  assert.match(worker, /getStationStorageRetentionPolicy/)
  assert.match(worker, /policy\.cleanupIntervalMs/)
  assert.match(worker, /job_type LIKE 'setup\.%'/)
  assert.match(supervisor, /startStationStorageRetentionWorker/)
})

test('station settings exposes retention controls and manual cleanup', () => {
  const page = read('app/(dashboard)/admin/settings/client.tsx')
  const printerPage = read('app/(dashboard)/admin/config/printers/page.tsx')
  const card = read('components/admin/printing/RetentionSettingsCard.tsx')
  const api = read('app/api/admin/config/retention/route.ts')
  const runApi = read('app/api/admin/config/retention/run/route.ts')
  assert.match(page, /RetentionSettingsCard/)
  assert.doesNotMatch(printerPage, /RetentionSettingsCard/)
  assert.match(card, /Enable automatic retention/)
  assert.match(card, /Dry-run only/)
  assert.match(card, /Successful printer test jobs/)
  assert.match(card, /Preview cleanup/)
  assert.match(api, /saveStationStorageRetentionPolicy/)
  assert.match(runApi, /force: true/)
})

test('print jobs are visible and manageable under forecourt operations', () => {
  const sidebar = read('components/layout/sidebar.tsx')
  const page = read('app/(dashboard)/admin/print-jobs/page.tsx')
  const api = read('app/api/admin/print-jobs/route.ts')
  const application = read('src/modules/printing/application/adminPrintJobs.ts')
  assert.match(sidebar, /label: 'Print Jobs', href: '\/admin\/print-jobs'/)
  assert.match(page, /title="Print Jobs"/)
  assert.match(page, /Retry/)
  assert.match(page, /Clear/)
  assert.match(api, /runAdminPrintJobAction/)
  assert.match(application, /Only failed print jobs can be retried/)
  assert.match(application, /Only terminal print jobs can be cleared/)
  assert.match(application, /enqueuePrintJob/)
})

test('printer setup tests do not report failed jobs as success', () => {
  const printouts = read('src/modules/setup/application/printouts.ts')
  assert.match(printouts, /processed\.status === 'FAILED'/)
  assert.match(printouts, /success: false/)
})
