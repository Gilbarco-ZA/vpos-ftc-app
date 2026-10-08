import { queryAll } from '@/src/platform/db/postgres'
import { badRequestError } from '@/src/platform/web/api/api-error'
import { ok } from '@/src/platform/web/api/response'
import { defineGetRoute } from '@/src/shared/http/defineRoute'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Preview is deliberately non-destructive. Native fiscal success is accepted
// as cloud evidence; legacy/backfilled records require separate upload proof.
export const GET = defineGetRoute({
  roles: ['administrator'],
  handler: async (req, { user }) => {
    const stationTimezoneSql = `COALESCE(
      (SELECT NULLIF(BTRIM(fs.timezone), '')
         FROM fuel_stations fs
        WHERE fs.id = $1 AND fs.deleted_at IS NULL
        LIMIT 1),
      'UTC'
    )`
    const params = new URL(req.url).searchParams
    const kind = params.get('kind') || 'transactions'
    const startDate = params.get('startDate') || ''
    const endDate = params.get('endDate') || ''
    if (!['transactions', 'reports'].includes(kind)) {
      throw badRequestError('Choose transactions or reports.')
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) ||
        !/^\d{4}-\d{2}-\d{2}$/.test(endDate) ||
        startDate > endDate) {
      throw badRequestError('Provide a valid start and end date.')
    }
    const values = [user.stationId, startDate, endDate]
    const counts = await queryAll<{ transactions: string; reports: string }>(
      `SELECT
          (SELECT COUNT(*)::text FROM transactions
             WHERE station_id = $1 AND deleted_at IS NULL
               AND transaction_date_time >= ($2::date::timestamp AT TIME ZONE ${stationTimezoneSql})
               AND transaction_date_time < (($3::date + INTERVAL '1 day') AT TIME ZONE ${stationTimezoneSql})) AS transactions,
          (SELECT COUNT(*)::text FROM reports
             WHERE station_id = $1
               AND report_date_time >= $2::date
               AND report_date_time < ($3::date + INTERVAL '1 day')) AS reports`,
      values,
    )
    const transactionsTotal = Number(counts[0]?.transactions ?? 0)
    const reportsTotal = Number(counts[0]?.reports ?? 0)
    if (kind === 'transactions') {
      const rows = await queryAll<{
        total: string
        native_confirmed: string
        legacy_or_unverified: string
      }>(
        `SELECT COUNT(*)::text AS total,
                COUNT(*) FILTER (
                  WHERE t.fiscalized_at IS NOT NULL
                    AND EXISTS (
                      SELECT 1 FROM fiscalization_events fe
                       WHERE fe.station_id = t.station_id
                         AND fe.transaction_id = t.id
                         AND fe.status = 'SUCCESS'
                         AND fe.origin = 'runtime'
                    )
                    AND NOT EXISTS (
                      SELECT 1 FROM fiscalization_events fe
                       WHERE fe.station_id = t.station_id
                         AND fe.transaction_id = t.id
                         AND fe.origin IN ('legacy_import', 'backfill')
                    )
                    AND t.legacy_filename IS NULL
                )::text AS native_confirmed,
                COUNT(*) FILTER (
                  WHERE t.fiscalized_at IS NULL
                     OR t.legacy_filename IS NOT NULL
                     OR NOT EXISTS (
                       SELECT 1 FROM fiscalization_events fe
                        WHERE fe.station_id = t.station_id
                          AND fe.transaction_id = t.id
                          AND fe.status = 'SUCCESS'
                          AND fe.origin = 'runtime'
                     )
                     OR EXISTS (
                       SELECT 1 FROM fiscalization_events fe
                        WHERE fe.station_id = t.station_id
                          AND fe.transaction_id = t.id
                          AND fe.origin IN ('legacy_import', 'backfill')
                     )
                )::text AS legacy_or_unverified
           FROM transactions t
          WHERE t.station_id = $1 AND t.deleted_at IS NULL
            AND t.transaction_date_time >= ($2::date::timestamp AT TIME ZONE ${stationTimezoneSql})
            AND t.transaction_date_time < (($3::date + INTERVAL '1 day') AT TIME ZONE ${stationTimezoneSql})`,
        values,
      )
      return ok({
        kind, startDate, endDate,
        total: transactionsTotal,
        transactionsTotal,
        reportsTotal,
        nativeConfirmed: Number(rows[0]?.native_confirmed ?? 0),
        legacyOrUnverified: Number(rows[0]?.legacy_or_unverified ?? 0),
        purgeAllowed: Number(rows[0]?.native_confirmed ?? 0) > 0,
        reason: 'Only FTC-native transactions with successful runtime fiscalization evidence can be purged. A backup, confirmation, and dependent-table checks are enforced for every batch. Legacy imports require separate cloud acknowledgement.',
      })
    }
    return ok({
      kind, startDate, endDate,
      total: reportsTotal,
      transactionsTotal,
      reportsTotal,
      nativeConfirmed: 0,
      legacyOrUnverified: reportsTotal,
      purgeAllowed: false,
      reason: 'Report cloud delivery acknowledgements are not yet verified; no reports will be deleted.',
    })
  },
})
