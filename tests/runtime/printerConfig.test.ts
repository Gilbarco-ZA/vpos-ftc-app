import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildPrinterConnectionPayload,
  normalizeAssignedFpIds,
  normalizePrinterConfig,
  summarizeAssignedPumps,
} from '@/src/modules/admin-config/presentation/printers'

test('normalizePrinterConfig preserves assigned pumps and merges defaults', () => {
  const printer = normalizePrinterConfig({
    name: 'Forecourt receipt printer',
    fpIds: ['2', 4, '4', 'bad', 1],
    connection: { host: '10.0.0.42' },
  })

  assert.equal(printer.name, 'Forecourt receipt printer')
  assert.deepEqual(printer.fpIds, [1, 2, 4])
  assert.equal(printer.connection?.host, '10.0.0.42')
  assert.equal(printer.connection?.port, 9100)
  assert.equal(printer.driverConfig?.width, 42)
})

test('normalizeAssignedFpIds accepts strings and arrays', () => {
  assert.deepEqual(normalizeAssignedFpIds('3, 2 1,3'), [1, 2, 3])
  assert.deepEqual(normalizeAssignedFpIds([5, '7', 'bad', 5]), [5, 7])
})

test('printer helpers produce operator-friendly summaries and test payloads', () => {
  assert.equal(
    summarizeAssignedPumps([2, 4]),
    'Assigned to pumps 2, 4.',
  )

  const payload = buildPrinterConnectionPayload(
    normalizePrinterConfig({
      connection: { host: '192.168.1.50', port: 9100 },
      driverConfig: { width: 48 },
    }),
  )

  assert.equal(payload.printerIP, '192.168.1.50')
  assert.equal(payload.port, 9100)
  assert.equal(payload.width, 48)
})
