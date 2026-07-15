import test from 'node:test'
import assert from 'node:assert/strict'

import { buildClaimEligibleProxyFiscalizationTransactionsSql } from '../../src/modules/transactions/infrastructure/persistence/transaction.sql'
import { transactionQueueSql } from '../../src/modules/transactions/infrastructure/transactionQueueSql'

test('proxy fiscalization claim SQL only claims proxy-routed stations', () => {
  const statement = buildClaimEligibleProxyFiscalizationTransactionsSql({
    stationId: 'station-1',
    linkingWindowSeconds: 30,
    limit: 5,
  })

  assert.match(statement.sql, /JOIN station_settings ss/i)
  assert.match(statement.sql, /ss\.fiscalization_transport = 'proxy'/i)
  assert.match(statement.sql, /FOR UPDATE OF t SKIP LOCKED/i)
})

test('local transaction queue worker only claims local TZ-routed station rows', () => {
  assert.match(transactionQueueSql.claimNextBatch, /JOIN station_settings ss/i)
  assert.match(
    transactionQueueSql.claimNextBatch,
    /ss\.fiscalization_transport = 'local_tz'/i,
  )
  assert.match(
    transactionQueueSql.claimNextBatch,
    /COALESCE\(tq\.payload->>'kind', ''\) <> 'CREDIT_NOTE'/i,
  )
})

test('local credit note queue worker only claims local TZ-routed credit notes', () => {
  assert.match(
    transactionQueueSql.claimNextCreditNoteBatch,
    /JOIN station_settings ss/i,
  )
  assert.match(
    transactionQueueSql.claimNextCreditNoteBatch,
    /ss\.fiscalization_transport = 'local_tz'/i,
  )
  assert.match(
    transactionQueueSql.claimNextCreditNoteBatch,
    /tq\.payload->>'kind' = 'CREDIT_NOTE'/i,
  )
  assert.match(
    transactionQueueSql.claimNextCreditNoteBatch,
    /FOR UPDATE OF tq SKIP LOCKED/i,
  )
})
