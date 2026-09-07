import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

const read = (path) => fs.readFileSync(path, 'utf8')

test('station workflow ordering is persisted with backward-compatible defaults', () => {
  const migration = read(
    'scripts/migrations/postgres/1290_station_workflow_ordering.sql',
  )
  const validation = read('src/shared/validations/index.ts')
  const settings = read('src/shared/settings/station.ts')
  const admin = read(
    'src/modules/admin-config/application/saveAdminSettings.ts',
  )
  const form = read(
    'app/(dashboard)/admin/settings/WorkflowOrderingForm.tsx',
  )
  const page = read('app/(dashboard)/admin/settings/client.tsx')

  assert.match(migration, /DEFAULT 'after_fiscalization'/)
  assert.match(migration, /DEFAULT 'after_transaction'/)
  assert.match(migration, /CREATE TABLE IF NOT EXISTS pre_fuel_customer_allocations/)
  assert.match(validation, /printReceiptOrder: z\s*\.enum\(\['before_fiscalization', 'after_fiscalization'\]\)/)
  assert.match(validation, /tinCaptureOrder: z\.enum\(\['before_transaction', 'after_transaction'\]\)/)
  assert.match(settings, /print_receipt_order = COALESCE/)
  assert.match(settings, /tin_capture_order = COALESCE/)
  assert.match(admin, /printReceiptOrder: args\.body\.printReceiptOrder/)
  assert.match(admin, /tinCaptureOrder: args\.body\.tinCaptureOrder/)
  assert.match(form, /name="printReceiptOrder"/)
  assert.match(form, /name="tinCaptureOrder"/)
  assert.match(page, /Transaction workflow/)
})

test('before-fiscalization receipt printing uses offline print and blocks fiscalization until DONE', () => {
  const autoPrint = read(
    'src/modules/transactions/infrastructure/fiscalization/autoPrintFiscalReceipt.ts',
  )
  const worker = read(
    'src/modules/transactions/infrastructure/fiscalization/offlineReceiptPrintWorker.ts',
  )
  const queue = read(
    'src/modules/transactions/infrastructure/persistence/transaction-queue.repository.ts',
  )
  const sendNow = read(
    'src/modules/transactions/application/commands/send-transaction-to-proxy-now.ts',
  )

  assert.match(autoPrint, /'before_fiscalization'/)
  assert.match(autoPrint, /phase === 'before_fiscalization' \? true/)
  assert.match(autoPrint, /getOrCreatePreFiscalizationReceipt/)
  assert.match(worker, /ss\.print_receipt_order = 'before_fiscalization'/)
  assert.match(worker, /phase: 'before_fiscalization'/)
  assert.match(queue, /preprint\.status = 'DONE'/)
  assert.match(queue, /preprint\.payload->>'offlinePrint'/)
  assert.match(sendNow, /requiresPreFiscalizationReceiptPrint/)
  assert.match(sendNow, /job\?\.status !== 'DONE'/)
})

test('Tanzania pre-fiscal receipt reserves verification prefix plus global counter', () => {
  const assignment = read(
    'src/modules/tanzania-fiscal/infrastructure/preFiscalizationReceiptAssignment.ts',
  )
  const receipt = read(
    'src/modules/transactions/infrastructure/fiscalization/preFiscalizationReceipt.ts',
  )

  assert.match(assignment, /resolveTanzaniaReceiptVerificationPrefix/)
  assert.match(assignment, /'receipt:global'/)
  assert.match(
    assignment,
    /const receiptVerificationNumber = `\$\{receiptVerificationPrefix\}\$\{globalCounter\}`/,
  )
  assert.match(assignment, /tanzania_proxy_invoice_assignments/)
  assert.match(receipt, /verificationCode: assignment\.receipt_verification_number/)
  assert.match(receipt, /globalCount: String\(assignment\.global_counter\)/)
  assert.match(receipt, /buildTanzaniaReceiptVerificationUrl/)
  assert.match(receipt, /buildTanzaniaReceiptLines/)
})

test('before-transaction TIN capture is nozzle-specific, durable and single use', () => {
  const api = read('app/api/transactions/pre-fuel-customer/route.ts')
  const command = read(
    'src/modules/transactions/application/commands/manage-pre-fuel-customer.ts',
  )
  const repo = read(
    'src/modules/transactions/infrastructure/preFuelCustomerAllocation.ts',
  )
  const queue = read(
    'src/modules/transactions/infrastructure/persistence/transaction-queue.repository.ts',
  )
  const tenant = read('components/transactions/TenantTransactionsClient.tsx')

  assert.match(api, /roles: \['tenant', 'manager', 'administrator'\]/)
  assert.match(api, /allocatePreFuelCustomer/)
  assert.match(command, /command: 'preFuelCustomer'/)
  assert.match(command, /cancelPreFuelCustomerAllocation/)
  assert.match(repo, /uq_pre_fuel_customer_allocations_pending_nozzle|ON CONFLICT \(station_id, pump_number, nozzle_number\)/)
  assert.match(repo, /status = 'CONSUMED'/)
  assert.match(queue, /ss\.tin_capture_order = 'before_transaction'/)
  assert.match(queue, /customer_id = candidates\.customer_id/)
  assert.match(queue, /'infinity'::timestamptz/)
  assert.match(tenant, /Pre-transaction customer capture/)
  assert.match(tenant, /\/api\/transactions\/fuel-options/)
  assert.match(tenant, /\/api\/transactions\/pre-fuel-customer/)
  assert.match(tenant, /Allocate customer & authorize/)
})
