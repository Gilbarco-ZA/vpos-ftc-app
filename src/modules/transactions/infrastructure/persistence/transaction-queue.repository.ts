import { queryAll, queryOne } from '@/src/platform/db/postgres'
import { uuidv4 } from '@/src/shared/utils/uuid'

import {
  buildClaimEligibleProxyFiscalizationTransactionsSql,
  buildClaimEligibleTransactionFiscalizationQueueSql,
  upsertTransactionQueueSql,
} from './transaction.sql'

export async function claimEligibleTransactionFiscalizationQueueRepo(input: {
  stationId: string
  linkingWindowSeconds: number | null
  limit?: number
}) {
  const statement = buildClaimEligibleTransactionFiscalizationQueueSql(input)
  return await queryAll<any>(statement.sql, statement.params)
}

export async function claimEligibleProxyFiscalizationTransactionsRepo(input: {
  stationId: string
  linkingWindowSeconds: number | null
  limit?: number
}) {
  const statement = buildClaimEligibleProxyFiscalizationTransactionsSql(input)
  return await queryAll<any>(statement.sql, statement.params)
}

export async function enqueueTransactionQueueRepo(
  stationId: string,
  transactionId: string,
  payload: any = {},
) {
  return await queryOne<any>(upsertTransactionQueueSql, [
    uuidv4(),
    stationId,
    JSON.stringify({ transactionId, ...payload }),
    transactionId,
  ])
}
