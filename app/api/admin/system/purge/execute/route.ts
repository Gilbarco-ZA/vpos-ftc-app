import { withTransaction } from '@/src/platform/db/postgres'
import { createDatabaseBackup } from '@/src/platform/maintenance/system-backups'
import { badRequestError } from '@/src/platform/web/api/api-error'
import { ok } from '@/src/platform/web/api/response'
import { uuidv4 } from '@/src/shared/utils/uuid'
import { defineMutationRoute } from '@/src/shared/http/defineRoute'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type PurgeRequest = {
  kind?: string
  startDate?: string
  endDate?: string
  confirmation?: string
  csrf_token?: string
}

export const POST = defineMutationRoute<PurgeRequest>({
  roles: ['administrator'],
  handler: async (_req, { user, body }) => {
    const stationTimezoneSql = `COALESCE(
      (SELECT NULLIF(BTRIM(fs.timezone), '')
         FROM fuel_stations fs
        WHERE fs.id = $1 AND fs.deleted_at IS NULL
        LIMIT 1),
      'UTC'
    )`
    const { kind, startDate, endDate, confirmation } = body ?? {}
    if (kind !== 'transactions') {
      throw badRequestError('Report purging is blocked until report cloud-delivery confirmation is available.')
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate || '') ||
        !/^\d{4}-\d{2}-\d{2}$/.test(endDate || '') ||
        !startDate || !endDate || startDate > endDate) {
      throw badRequestError('Provide a valid date range.')
    }
    if (endDate >= new Date().toISOString().slice(0, 10)) {
      throw badRequestError('The purge end date must be before today.')
    }
    if (confirmation !== `PURGE TRANSACTIONS ${startDate} ${endDate}`) {
      throw badRequestError('Typed purge confirmation does not match the selected range.')
    }

    // Create a recovery point before even attempting a destructive operation.
    const backup = await createDatabaseBackup()

    const result = await withTransaction(async (client) => {
      const lock = await client.query<{ acquired: boolean }>(
        "SELECT pg_try_advisory_xact_lock(hashtext('vpos:historical-purge')) AS acquired",
      )
      if (!lock.rows[0]?.acquired) throw badRequestError('Another data purge is in progress.')

      // Reject unknown restrict/no-action dependencies; CASCADE and SET NULL
      // are applied by PostgreSQL itself. Receipts are explicitly removed.
      const unsafe = await client.query<{ child: string; delete_action: string }>(
        `SELECT con.conrelid::regclass::text AS child, con.confdeltype AS delete_action
           FROM pg_constraint con
          WHERE con.contype = 'f'
            AND con.confrelid IN ('transactions'::regclass, 'receipts'::regclass)
            AND con.confdeltype NOT IN ('c', 'n', 'd')
            AND NOT (con.confrelid = 'transactions'::regclass
                     AND con.conrelid = 'receipts'::regclass)`,
      )
      if (unsafe.rows.length) {
        throw badRequestError('Purge blocked by dependent tables requiring explicit retention decisions: ' +
          unsafe.rows.map((row) => row.child).join(', '))
      }

      const selected = await client.query<{ id: string }>(
        `SELECT t.id FROM transactions t
          WHERE t.station_id = $1
            AND t.deleted_at IS NULL
            AND t.transaction_date_time >= ($2::date::timestamp AT TIME ZONE ${stationTimezoneSql})
            AND t.transaction_date_time < (($3::date + INTERVAL '1 day') AT TIME ZONE ${stationTimezoneSql})
            AND t.fiscalized_at IS NOT NULL
            AND t.legacy_filename IS NULL
            AND EXISTS (
              SELECT 1 FROM fiscalization_events fe
               WHERE fe.station_id = t.station_id
                 AND fe.transaction_id = t.id
                 AND fe.status = 'SUCCESS' AND fe.origin = 'runtime'
            )
            AND NOT EXISTS (
              SELECT 1 FROM fiscalization_events fe
               WHERE fe.station_id = t.station_id
                 AND fe.transaction_id = t.id
                 AND fe.origin IN ('legacy_import', 'backfill')
            )
            AND NOT EXISTS (
              SELECT 1 FROM transaction_queue tq
               WHERE tq.station_id = t.station_id AND tq.transaction_id = t.id
                 AND tq.status NOT IN ('DONE', 'COMPLETED', 'SUCCESS')
            )
            AND NOT EXISTS (
              SELECT 1 FROM print_jobs pj
               WHERE pj.station_id = t.station_id AND pj.source_transaction_id = t.id
                 AND pj.status NOT IN ('DONE', 'COMPLETED', 'SUCCESS')
            )
            -- Do not destroy fiscal invoice counters or regulatory/refund
            -- evidence: cascading the assignments would free unique numbers.
            AND NOT EXISTS (
              SELECT 1 FROM tanzania_proxy_invoice_assignments assignment
               WHERE assignment.station_id = t.station_id
                 AND assignment.transaction_id = t.id
            )
            AND NOT EXISTS (
              SELECT 1 FROM credit_notes credit
               WHERE credit.station_id = t.station_id
                 AND credit.transaction_id = t.id
            )
            AND NOT EXISTS (
              SELECT 1 FROM ewura_transactions ewura
               WHERE ewura.station_id = t.station_id
                 AND ewura.transaction_id = t.id
            )
          ORDER BY t.transaction_date_time, t.id
          LIMIT 50
          FOR UPDATE OF t SKIP LOCKED`,
        [user.stationId, startDate, endDate],
      )
      const ids = selected.rows.map((row) => row.id)
      if (ids.length === 0) return { deleted: 0, backup: backup.filename }
      await client.query(
        'DELETE FROM receipts WHERE station_id = $1 AND transaction_id = ANY($2::uuid[])',
        [user.stationId, ids],
      )
      const deleted = await client.query(
        'DELETE FROM transactions WHERE station_id = $1 AND id = ANY($2::uuid[])',
        [user.stationId, ids],
      )
      const deletedCount = deleted.rowCount ?? 0
      // The audit entry and deletion share one DB transaction. If audit
      // persistence fails, PostgreSQL rolls back the entire purge batch.
      await client.query(
        `INSERT INTO audit_logs
           (id, station_id, user_id, action, entity_type, entity_id, metadata)
         VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $5, $6, $7::jsonb)`,
        [
          uuidv4(), user.stationId, user.id,
          'NATIVE_FISCALIZED_TRANSACTIONS_PURGED',
          'data_maintenance', user.stationId,
          JSON.stringify({
            deleted: deletedCount,
            backup: backup.filename,
            transactionIds: ids,
            startDate, endDate, kind,
          }),
        ],
      )
      return { deleted: deletedCount, backup: backup.filename }
    })
    return ok({ ...result, batchLimit: 50, kind, startDate, endDate })
  },
})
