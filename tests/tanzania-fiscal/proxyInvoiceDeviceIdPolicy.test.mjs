import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(here, '../..')
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8')

test('Tanzania cloud-bound submissions omit FTC-owned device and EWURA identity fields', () => {
  const enrichment = read(
    'src/modules/tanzania-fiscal/infrastructure/proxyInvoice.ts',
  )
  const dailyWorker = read(
    'src/modules/tanzania-fiscal/infrastructure/proxyDailyTotalsWorker.ts',
  )
  const tankPublisher = read(
    'src/modules/tanzania-fiscal/infrastructure/proxyTankInventories.ts',
  )
  const payload = read(
    'src/modules/transactions/infrastructure/fiscalization/transaction-proxy.payload.ts',
  )
  const proxyClient = read(
    'src/modules/transactions/infrastructure/fiscalization/proxyClient.ts',
  )

  assert.doesNotMatch(enrichment, /deviceId: effectiveDeviceId/)
  assert.doesNotMatch(enrichment, /requires an effective deviceId/)
  assert.match(enrichment, /currency: 'TZS'/)
  assert.doesNotMatch(payload, /deviceId: invoice\.deviceId/)

  assert.doesNotMatch(proxyClient, /x-device-id/i)
  assert.doesNotMatch(proxyClient, /effectiveDeviceId/)
  assert.doesNotMatch(proxyClient, /requires an effective deviceId/)

  assert.doesNotMatch(dailyWorker, /config\.proxy\.deviceId/)
  assert.doesNotMatch(dailyWorker, /deviceId: effectiveDeviceId/)
  assert.doesNotMatch(tankPublisher, /config\.proxy\.deviceId/)
  assert.doesNotMatch(tankPublisher, /EWURA_LC/)
  assert.doesNotMatch(tankPublisher, /config\.ewura\.licenseNo/)
  assert.doesNotMatch(tankPublisher, /deviceId: effectiveDeviceId/)
})

test('Tanzania proxy invoice fiscal identifiers use the required authority format', () => {
  const enrichment = read(
    'src/modules/tanzania-fiscal/infrastructure/proxyInvoice.ts',
  )
  const prefixPolicy = read(
    'src/modules/tanzania-fiscal/domain/receiptVerificationPrefix.ts',
  )
  const customerIdentity = read(
    'src/modules/tanzania-fiscal/domain/customerIdentity.ts',
  )
  const receiptBuilder = read(
    'src/modules/transactions/infrastructure/fiscalization/receiptBuilder.ts',
  )
  const receiptTemplate = read(
    'src/shared/fiscalization/receipt/templates/TZ.ts',
  )
  const receiptRepository = read(
    'src/modules/transactions/infrastructure/persistence/transaction-read.repository.ts',
  )

  assert.match(prefixPolicy, /development: 'F1D845'/)
  assert.match(prefixPolicy, /production: '4BC37A'/)
  assert.match(enrichment, /tanzania_receipt_verification_prefix_mode/)
  assert.match(enrichment, /tanzania_receipt_verification_prefix_override/)
  assert.match(enrichment, /resolveTanzaniaReceiptVerificationPrefix/)
  assert.match(
    enrichment,
    /`\$\{receiptVerificationPrefix\}\$\{globalCounter\}`/,
  )
  assert.match(
    enrichment,
    /const transactionDate = dateParts\(args\.transactionDate, args\.timezone\)/,
  )
  assert.match(
    enrichment,
    /const fiscalDate = dateParts\(args\.fiscalizationDate, args\.timezone\)/,
  )
  assert.match(enrichment, /`receipt:\$\{transactionDate\.compactDate\}`/)
  assert.match(enrichment, /args\.fiscalizationDate/)
  assert.match(enrichment, /fiscalDate\.compactDate/)
  assert.match(
    enrichment,
    /isoDateTimeInTimezone\(row\.invoice_date, args\.timezone\)/,
  )
  assert.match(enrichment, /custIdType: customerIdentity\.customerIdType/)
  assert.match(enrichment, /custId: customerIdentity\.customerId/)
  assert.doesNotMatch(enrichment, /config\.tra\.customerIdType/)
  assert.match(enrichment, /custMobile: customerMobile/)
  assert.match(customerIdentity, /TIN: '1'/)
  assert.match(customerIdentity, /NIL: '6'/)
  assert.match(receiptBuilder, /tanzaniaCustomerIdentity\.customerIdType/)
  assert.match(receiptTemplate, /hasCustomerId \? '1' : '6'/)
  assert.match(receiptRepository, /hasStaleTanzaniaCustomerIdType/)
})
