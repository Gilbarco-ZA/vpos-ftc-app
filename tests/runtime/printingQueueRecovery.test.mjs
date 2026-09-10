import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

const read = (path) => fs.readFileSync(path, 'utf8')

test('admin print jobs supports safe clear all without deleting in-flight jobs', () => {
  const page = read('app/(dashboard)/admin/print-jobs/page.tsx')
  const route = read('app/api/admin/print-jobs/route.ts')
  const application = read('src/modules/printing/application/adminPrintJobs.ts')
  const sql = read('src/modules/printing/infrastructure/printJobs.sql.ts')

  assert.match(page, /Clear all/)
  assert.match(page, /action: 'clearAll'/)
  assert.match(page, /Jobs currently printing will not be removed/)
  assert.match(route, /'clearAll'/)
  assert.match(application, /clearAllAdminPrintJobs/)
  assert.match(application, /action: 'PRINT_JOB_CLEARED'/)
  assert.match(application, /bulk: true/)
  assert.match(application, /clearedCount: cleared\.length/)
  assert.match(sql, /status IN \('PENDING', 'DONE', 'FAILED'\)/)
  assert.doesNotMatch(sql, /status IN \('PENDING', 'PROCESSING', 'DONE', 'FAILED'\)/)
})

test('printer connectivity recovery preserves and releases queued auto-prints', () => {
  const worker = read(
    'src/modules/printing/infrastructure/printerConnectivityWorker.ts',
  )
  const printWorker = read(
    'src/modules/printing/infrastructure/printJobsWorker.ts',
  )
  const repo = read('src/modules/printing/infrastructure/printJobsRepo.ts')
  const sql = read('src/modules/printing/infrastructure/printJobs.sql.ts')
  const runtime = read('src/modules/runtime/infrastructure/inProcessRuntime.ts')

  assert.match(worker, /startPrinterConnectivityWorker/)
  assert.match(worker, /isAutoPrintEnabled/)
  assert.match(worker, /releasePendingPrintJobs/)
  assert.match(worker, /wasConnected !== true/)
  assert.match(printWorker, /isPrinterConnectivityError/)
  assert.match(printWorker, /holdForConnectivityRetry/)
  assert.match(repo, /isAutoPrintEnabled/)
  assert.match(sql, /attempts = GREATEST\(attempts - 1, 0\)/)
  assert.match(sql, /scheduled_at = NOW\(\)/)
  assert.match(runtime, /name: 'printerConnectivityWorker'/)
})
