CREATE TABLE IF NOT EXISTS forecourt_wetstock_events (
    id UUID PRIMARY KEY,
    station_id UUID NOT NULL REFERENCES fuel_stations(id) ON DELETE CASCADE,
    tank_id UUID REFERENCES tanks(id) ON DELETE SET NULL,
    tg_id VARCHAR(10),
    delivery_report_seq_no VARCHAR(10),
    tank_delivery_seq_no VARCHAR(10),
    event_type VARCHAR(64) NOT NULL,
    source VARCHAR(16) NOT NULL DEFAULT 'doms'
        CHECK (source IN ('doms', 'local')),
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    data JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_forecourt_wetstock_events_station_id
    ON forecourt_wetstock_events(station_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_forecourt_wetstock_events_tg_id
    ON forecourt_wetstock_events(station_id, tg_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_forecourt_wetstock_events_delivery
    ON forecourt_wetstock_events(station_id, delivery_report_seq_no, tank_delivery_seq_no, created_at DESC);

CREATE TABLE IF NOT EXISTS forecourt_tank_delivery_checkpoints (
    id UUID PRIMARY KEY,
    station_id UUID NOT NULL REFERENCES fuel_stations(id) ON DELETE CASCADE,
    tank_id UUID REFERENCES tanks(id) ON DELETE SET NULL,
    tg_id VARCHAR(10) NOT NULL,
    delivery_report_seq_no VARCHAR(10) NOT NULL,
    tank_delivery_seq_no VARCHAR(10) NOT NULL,
    pos_id VARCHAR(10),
    clear_status VARCHAR(32) NOT NULL DEFAULT 'pending_clear'
        CHECK (clear_status IN ('pending_clear', 'cleared_on_doms', 'clear_failed')),
    source VARCHAR(16) NOT NULL DEFAULT 'doms'
        CHECK (source IN ('doms', 'local')),
    last_event_type VARCHAR(64),
    first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_event_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    data JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT forecourt_tank_delivery_checkpoints_unique
        UNIQUE (station_id, delivery_report_seq_no, tg_id, tank_delivery_seq_no)
);

CREATE INDEX IF NOT EXISTS idx_forecourt_tank_delivery_checkpoints_station_id
    ON forecourt_tank_delivery_checkpoints(station_id, last_event_at DESC);
CREATE INDEX IF NOT EXISTS idx_forecourt_tank_delivery_checkpoints_status
    ON forecourt_tank_delivery_checkpoints(station_id, clear_status, last_event_at DESC);
CREATE INDEX IF NOT EXISTS idx_forecourt_tank_delivery_checkpoints_tg_id
    ON forecourt_tank_delivery_checkpoints(station_id, tg_id, last_event_at DESC);

DROP TRIGGER IF EXISTS update_forecourt_tank_delivery_checkpoints_updated_at ON forecourt_tank_delivery_checkpoints;
CREATE TRIGGER update_forecourt_tank_delivery_checkpoints_updated_at
BEFORE UPDATE ON forecourt_tank_delivery_checkpoints
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
