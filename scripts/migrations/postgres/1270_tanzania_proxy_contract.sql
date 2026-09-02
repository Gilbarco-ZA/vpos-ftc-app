-- Tanzania-only proxy invoice sequencing and daily-total submission outbox.

CREATE TABLE IF NOT EXISTS tanzania_proxy_invoice_assignments (
    station_id UUID NOT NULL REFERENCES fuel_stations(id) ON DELETE CASCADE,
    transaction_id UUID NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
    invoice_number TEXT NOT NULL,
    receipt_verification_number TEXT NOT NULL,
    z_number TEXT NOT NULL,
    daily_counter BIGINT NOT NULL CHECK (daily_counter > 0),
    global_counter BIGINT NOT NULL CHECK (global_counter > 0),
    invoice_date TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (station_id, transaction_id),
    UNIQUE (station_id, invoice_number),
    UNIQUE (station_id, global_counter),
    UNIQUE (station_id, z_number, daily_counter)
);

CREATE INDEX IF NOT EXISTS idx_tanzania_proxy_invoice_assignments_z
    ON tanzania_proxy_invoice_assignments(station_id, z_number, daily_counter);

CREATE TABLE IF NOT EXISTS tanzania_daily_total_submissions (
    id UUID PRIMARY KEY,
    station_id UUID NOT NULL REFERENCES fuel_stations(id) ON DELETE CASCADE,
    business_date DATE NOT NULL,
    z_number TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'PENDING'
        CHECK (status IN ('PENDING', 'SENDING', 'QUEUED', 'SENT', 'FAILED')),
    request_payload JSONB NOT NULL,
    response_payload JSONB,
    proxy_request_id TEXT,
    retry_count INTEGER NOT NULL DEFAULT 0,
    next_retry_at TIMESTAMPTZ,
    last_error TEXT,
    submitted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (station_id, business_date)
);

CREATE INDEX IF NOT EXISTS idx_tanzania_daily_total_submissions_due
    ON tanzania_daily_total_submissions(station_id, status, next_retry_at, business_date)
    WHERE status IN ('PENDING', 'FAILED');

-- Tanzania fiscal traffic is proxy-owned. Convert any retained legacy local
-- transport setting so existing Tanzania stations can enter the proxy queue.
UPDATE station_settings ss
   SET fiscalization_transport = 'proxy',
       updated_at = NOW()
  FROM fuel_stations fs
  LEFT JOIN station_config sc ON sc.station_id = fs.id
 WHERE ss.station_id = fs.id
   AND ss.fiscalization_transport = 'local_tz'
   AND UPPER(COALESCE(
         NULLIF(BTRIM(fs.country), ''),
         NULLIF(BTRIM(sc.config_json #>> '{config,country}'), ''),
         NULLIF(BTRIM(sc.config_json #>> '{country}'), '')
       )) IN ('TZ', 'TZA', 'TANZANIA', 'UNITED REPUBLIC OF TANZANIA');
