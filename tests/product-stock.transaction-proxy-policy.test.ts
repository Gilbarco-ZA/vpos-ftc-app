import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

test('transaction stock movements are local-only and transaction commands do not send stock separately', () => {
  const repository = readFileSync(
    'src/modules/stock/infrastructure/stock.repository.ts',
    'utf8',
  )
  const stockProxy = readFileSync(
    'src/modules/stock/infrastructure/stockProxy.ts',
    'utf8',
  )
  const retryCommand = readFileSync(
    'src/modules/stock/application/retryStockMovement.ts',
    'utf8',
  )
  const createCommand = readFileSync(
    'src/modules/transactions/application/commands/create-manual-transaction.ts',
    'utf8',
  )
  const editCommand = readFileSync(
    'src/modules/transactions/application/commands/replace-transaction-lines.ts',
    'utf8',
  )

  assert.ok(repository.includes("'POS_TRANSACTION', $14, $15, 'NOT_REQUIRED'"))
  assert.equal(createCommand.includes('syncTransactionStockMovements'), false)
  assert.equal(editCommand.includes('syncTransactionStockMovements'), false)

  const localOnlyGuard =
    'if (!stockMovementRequiresProxy(movement.sourceType))'
  const guardIndex = stockProxy.indexOf(localOnlyGuard)
  const payloadIndex = stockProxy.indexOf(
    'getStockMovementPayloadSourceRepo(stationId, movementId)',
  )
  const postIndex = stockProxy.indexOf('await postStockPayload({')

  assert.ok(guardIndex >= 0, 'stock proxy must reject local-only movements')
  assert.ok(
    payloadIndex > guardIndex,
    'local-only guard must run before building the proxy payload',
  )
  assert.ok(
    postIndex > guardIndex,
    'local-only guard must run before any proxy request',
  )
  assert.ok(
    retryCommand.includes(localOnlyGuard),
    'retry must not make POS movements proxy-eligible',
  )
})
