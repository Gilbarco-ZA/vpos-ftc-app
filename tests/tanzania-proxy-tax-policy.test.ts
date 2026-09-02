import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import type { ProxyInvoiceRequest } from '@/src/shared/fiscalization/proxy/contracts'
import { TZ_DATASET } from '@/src/shared/config/datasets/TZ'
import { assertTanzaniaProxyTaxCodes } from '@/src/modules/tanzania-fiscal/infrastructure/proxyInvoiceTaxPolicy'

function invoiceWithTaxCode(code: string | null): ProxyInvoiceRequest {
  return {
    documentId: 'transaction-1',
    issueDateTime: '2026-08-06T08:00:00.000Z',
    lines: [
      {
        product: { description: 'Fuel', quantity: 1, unitPrice: 100 },
        taxes: [{ type: code, rate: 18, base: 84.75, amount: 15.25 }],
      },
    ],
  }
}

test('Tanzania proxy accepts TRA tax codes A through E', () => {
  for (const code of ['A', 'B', 'C', 'D', 'E']) {
    assert.doesNotThrow(() =>
      assertTanzaniaProxyTaxCodes(invoiceWithTaxCode(code)),
    )
  }
})

test('Tanzania proxy rejects TaxCode Z before fiscal counter allocation', () => {
  assert.throws(
    () => assertTanzaniaProxyTaxCodes(invoiceWithTaxCode('Z')),
    /TaxCode Z is not supported by vpos-proxy/,
  )

  const enrichmentSource = readFileSync(
    'src/modules/tanzania-fiscal/infrastructure/proxyInvoice.ts',
    'utf8',
  )
  assert.ok(
    enrichmentSource.indexOf('assertTanzaniaProxyTaxCodes(args.invoice)') <
      enrichmentSource.indexOf('allocateAssignment({'),
  )
})

test('Tanzania catalog and migration disable TaxCode Z', () => {
  assert.equal(TZ_DATASET.taxTypes.some((tax) => tax.code === 'Z'), false)

  const migration = readFileSync(
    'scripts/migrations/postgres/1272_tanzania_proxy_tax_code_policy.sql',
    'utf8',
  )
  assert.match(migration, /dataset_type = 'taxTypes'/)
  assert.match(migration, /UPPER\(code\) = 'Z'/)
  assert.match(migration, /is_active = FALSE/)
})
