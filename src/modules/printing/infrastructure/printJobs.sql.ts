export const printJobsSql = {
  selectDefaultPrinterConfig: `SELECT device_key, config_json
     FROM device_configs
     WHERE station_id = $1
       AND device_type = 'printer'
       AND enabled = TRUE
     ORDER BY (device_key = 'default') DESC, updated_at DESC
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
		RETURNING id, station_id, job_type, payload`,
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
    RETURNING pj.id, pj.station_id, pj.job_type, pj.payload, pj.attempts, pj.max_attempts`,
  scheduleRetry: `UPDATE print_jobs
    SET status='PENDING',
        last_error=$2,
        scheduled_at = NOW() + ($3::text || ' seconds')::interval,
        updated_at=NOW()
    WHERE id=$1`,
} as const
