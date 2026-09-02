import assert from 'node:assert/strict'
import test from 'node:test'

import type { ProxyInvoiceRequest } from '@/src/shared/fiscalization/proxy/contracts'
import {
  applyTanzaniaTankProjectionToInvoice,
  calculateTanzaniaReportedTankVolume,
  normalizeTanzaniaTankId,
  type TanzaniaTransactionTankProjection,
} from '@/src/modules/tanzania-fiscal/infrastructure/transactionTankProjection'

test('Tanzania grouped tank projection deducts cumulative sale litres from the ATG group baseline', () => {
  assert.equal(
    calculateTanzaniaReportedTankVolume({
      baselineVolumeLitres: 35_000,
      priorSalesVolumeLitres: 0,
      transactionVolumeLitres: 40,
    }),
    34_960,
  )
  assert.equal(
    calculateTanzaniaReportedTankVolume({
      baselineVolumeLitres: 35_000,
      priorSalesVolumeLitres: 40,
      transactionVolumeLitres: 30,
    }),
    34_930,
  )
})

test('Tanzania tank ids normalize DOMS zero padding and retain non-numeric ids', () => {
  assert.equal(normalizeTanzaniaTankId('01'), '1')
  assert.equal(normalizeTanzaniaTankId('004'), '4')
  assert.equal(normalizeTanzaniaTankId('TANK-A'), 'TANK-A')
  assert.equal(normalizeTanzaniaTankId(''), null)
})

test('Tanzania projection fails closed instead of reporting a negative tank balance', () => {
  assert.throws(
    () =>
      calculateTanzaniaReportedTankVolume({
        baselineVolumeLitres: 50,
        priorSalesVolumeLitres: 40,
        transactionVolumeLitres: 20,
      }),
    /would be negative/,
  )
})

test('Tanzania invoice uses the representative DOMS Tank_ID and projected post-sale volume', () => {
  const invoice: ProxyInvoiceRequest = {
    documentId: 'tx-1',
    issueDateTime: '2026-08-27T08:00:00.000Z',
    lines: [
      {
        lineId: '1',
        product: {
          quantity: 40,
          fuel: {
            gradeName: 'Diesel',
            tankId: 'local-tank-uuid',
            pumpId: '3',
            nozzleId: '2',
          },
        },
      },
    ],
  }
  const projection: TanzaniaTransactionTankProjection = {
    stationId: 'station-1',
    transactionId: 'tx-1',
    productId: 'product-1',
    scopeType: 'GROUP',
    scopeKey: 'group:group-1',
    sourceTankId: 'tank-2',
    sourceDomsTankId: '2',
    tankGroupId: 'group-1',
    representativeTankId: 'tank-1',
    representativeDomsTankId: '1',
    atgCapturedAt: '2026-08-27T07:50:00.000Z',
    baselineVolumeLitres: 35_000,
    priorSalesVolumeLitres: 0,
    transactionVolumeLitres: 40,
    reportedVolumeLitres: 34_960,
    memberTankIds: ['tank-1', 'tank-2'],
    memberDomsTankIds: ['1', '2'],
  }

  const mapped = applyTanzaniaTankProjectionToInvoice(invoice, projection)
  assert.equal(mapped.lines?.[0]?.product?.fuel?.tankId, '1')
  assert.equal(mapped.lines?.[0]?.product?.fuel?.tankVolume, 34_960)
  assert.equal(mapped.lines?.[0]?.product?.fuel?.pumpId, '3')
  assert.equal(mapped.lines?.[0]?.product?.fuel?.nozzleId, '2')
})
