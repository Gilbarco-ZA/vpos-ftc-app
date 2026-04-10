import type { PoolClient, QueryResult, QueryResultRow } from 'pg'

import { txQuery, withTransaction } from '@/src/platform/db/postgres/core'

export type { PoolClient, QueryResult, QueryResultRow } from 'pg'
export type { TransactionCallback } from '@/src/platform/db/postgres/core'

export { txQuery, withTransaction }
