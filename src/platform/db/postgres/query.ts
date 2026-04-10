import type { QueryResult, QueryResultRow } from 'pg'

import {
  db,
  query,
  queryAll,
  queryOne,
  queryPaginated,
  queryUnobserved,
} from '@/src/platform/db/postgres/core'

export type { QueryResult, QueryResultRow } from 'pg'
export type {
  PaginatedResult,
  PaginationParams,
} from '@/src/platform/db/postgres/core'

export { db, query, queryAll, queryOne, queryPaginated, queryUnobserved }
