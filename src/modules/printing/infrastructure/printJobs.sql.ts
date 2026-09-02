export const printJobsSql = {
  selectDefaultPrinterConfig: `SELECT device_key, config_json
     FROM device_configs
     WHERE station_id = $1
       AND device_type = 'printer'
       AND enabled = TRUE
     ORDER BY (device_key = 'default') DESC, updated_at DESC
     LIMIT 1`,
  selectEnabledPrinterConfigs: `SELECT device_key, config_json, updated_at
     FROM device_configs
     WHERE station_id = $1
       AND device_type = 'printer'
       AND enabled = TRUE
     ORDER BY updated_at DESC, device_key ASC`,
  selectTransactionPumpNumber: `SELECT pump_number
     FROM transactions
     WHERE station_id = $1
       AND id = $2::uuid
     LIMIT 1`,
  selectReceiptPrintSource: `SELECT r.id, r.receipt_number,
            r.plain_text_content, r.html_content, r.fiscal_data,
            r.branding_snapshot,
            fs.country AS station_country,
            fs.name AS station_name,
            COALESCE(
              NULLIF(BTRIM(CAST(r.fiscal_data->'receipt'->>'companyTin' AS text)), ''),
              NULLIF(BTRIM(CAST(r.fiscal_data->'model'->'station'->>'taxId' AS text)), ''),
              NULLIF(BTRIM(CAST((
                SELECT sk.value->>'tin'
                  FROM station_kv sk
                 WHERE sk.station_id = r.station_id
                   AND sk.key = 'tax_pin'
                 LIMIT 1
              ) AS text)), ''),
              NULLIF(BTRIM(CAST((
                SELECT sk.value->>'tax_pin'
                  FROM station_kv sk
                 WHERE sk.station_id = r.station_id
                   AND sk.key = 'tax_pin'
                 LIMIT 1
              ) AS text)), ''),
              ''
            ) AS station_tin
     FROM receipts r
     JOIN fuel_stations fs ON fs.id = r.station_id
     WHERE r.station_id = $1
       AND r.transaction_id = $2::uuid
       AND (
         NULLIF(BTRIM(CAST($3 AS text)), '') IS NULL
         OR r.id = CASE
           WHEN BTRIM(CAST($3 AS text)) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
             THEN BTRIM(CAST($3 AS text))::uuid
           ELSE NULL
         END
       )
     ORDER BY r.generated_at DESC, r.created_at DESC
     LIMIT 1`,
  selectPrintJobStatus: `SELECT id, station_id, status, last_error, completed_at,
            source_transaction_id
     FROM print_jobs
     WHERE station_id = $1
       AND id = $2::uuid
     LIMIT 1`,
  selectReportPrintSource: `SELECT id, report_type, report_date_time, payload
     FROM reports
     WHERE station_id = $1
       AND id = $2::uuid
     LIMIT 1`,
  markDone:
    "UPDATE print_jobs SET status='DONE', completed_at=NOW(), last_error=NULL, updated_at=NOW() WHERE id=$1",
  markFailed:
    "UPDATE print_jobs SET status='FAILED', completed_at=NOW(), last_error=$2, updated_at=NOW() WHERE id=$1",
  claimNextForStation: `WITH next AS (
      SELECT id
      FROM print_jobs
      WHERE station_id = $1
        AND status = 'PENDING'
        AND scheduled_at <= NOW()
      ORDER BY priority DESC, created_at ASC
      FOR UPDATE SKIP LOCKED
      LIMIT 1
    )
    UPDATE print_jobs
    SET status = 'PROCESSING',
      started_at = NOW(),
      attempts = attempts + 1,
      updated_at = NOW()
    WHERE id IN (SELECT id FROM next)
    RETURNING id, station_id, job_type, payload, attempts, max_attempts,
      source_transaction_id, source_report_id`,
  claimNextForWorker: `WITH next AS (
      SELECT id FROM print_jobs
      WHERE status = 'PENDING'
        AND station_id = $1
        AND scheduled_at <= NOW()
      ORDER BY priority DESC, created_at ASC
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    )
    UPDATE print_jobs pj
      SET status='PROCESSING',
          started_at=NOW(),
          attempts = attempts + 1,
          updated_at=NOW()
    FROM next
    WHERE pj.id = next.id
    RETURNING pj.id, pj.station_id, pj.job_type, pj.payload, pj.attempts,
      pj.max_attempts, pj.source_transaction_id, pj.source_report_id`,
  scheduleRetry: `UPDATE print_jobs
    SET status='PENDING',
        last_error=$2,
        scheduled_at = NOW() + ($3::text || ' seconds')::interval,
        updated_at=NOW()
    WHERE id=$1`,
} as const
