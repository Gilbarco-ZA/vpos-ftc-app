import type { PoolClient } from '@/src/platform/db/postgres'
import { withTransaction } from '@/src/platform/db/postgres'
import type { RecoveryReceiptPrintBoundary, RecoveryReceiptPrintTransaction } from './transactionalRecoveryReceiptPrint'
import { createPostgresRecoveryReceiptRead } from './postgresRecoveryReceiptRead'
import { createPostgresRecoveryPrintPort } from './postgresRecoveryPrintPort'

/**
 * Opt-in PostgreSQL boundary. Both ports share a single PoolClient and
 * transaction. Not imported by production routes or recovery workers.
 */
export function createPostgresRecoveryReceiptPrintBoundary(): RecoveryReceiptPrintBoundary {
  return {
    transaction<T>(run: (ports: RecoveryReceiptPrintTransaction) => Promise<T>): Promise<T> {
      return withTransaction(async (client: PoolClient) => run({
        receiptRead: createPostgresRecoveryReceiptRead(client),
        printing: createPostgresRecoveryPrintPort(client),
      }))
    },
  }
}
