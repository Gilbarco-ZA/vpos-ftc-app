-- Tanzania transaction-level tank inventory projection.
--
-- A transaction may report only one regulatory Tank_ID even when multiple
-- physical tanks of the same grade form one configured tank group. Preserve
-- the ATG baseline and calculated post-sale balance used for that transaction
-- so delayed fiscalization/retries cannot switch to a newer gauge snapshot.

CREATE TABLE IF NOT EXISTS tanzania_transaction_tank_projections (
    station_id UUID NOT NULL REFERENCES fuel_stations(id) ON DELETE CASCADE,
    transaction_id UUID NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
    scope_type TEXT NOT NULL CHECK (scope_type IN ('GROUP', 'ACTIVE_TANK')),
    scope_key TEXT NOT NULL,
    source_tank_id UUID NOT NULL REFERENCES tanks(id) ON DELETE RESTRICT,
    source_doms_tank_id TEXT,
    tank_group_id UUID REFERENCES tank_groups(id) ON DELETE RESTRICT,
    representative_tank_id UUID NOT NULL REFERENCES tanks(id) ON DELETE RESTRICT,
    representative_doms_tank_id TEXT NOT NULL,
    atg_captured_at TIMESTAMPTZ NOT NULL,
    baseline_volume_litres NUMERIC(14, 3) NOT NULL CHECK (baseline_volume_litres >= 0),
    prior_sales_volume_litres NUMERIC(14, 3) NOT NULL DEFAULT 0 CHECK (prior_sales_volume_litres >= 0),
    transaction_volume_litres NUMERIC(14, 3) NOT NULL CHECK (transaction_volume_litres > 0),
    reported_volume_litres NUMERIC(14, 3) NOT NULL CHECK (reported_volume_litres >= 0),
    member_tank_ids UUID[] NOT NULL DEFAULT ARRAY[]::UUID[],
    member_doms_tank_ids TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (station_id, transaction_id)
);

CREATE INDEX IF NOT EXISTS idx_tanzania_tank_projection_scope
    ON tanzania_transaction_tank_projections(station_id, scope_key, atg_captured_at);

CREATE INDEX IF NOT EXISTS idx_tanzania_tank_projection_representative
    ON tanzania_transaction_tank_projections(station_id, representative_tank_id, atg_captured_at);

COMMENT ON TABLE tanzania_transaction_tank_projections IS
  'Immutable ATG baseline plus recalculated cumulative Tanzania sale deductions used to report one Tank_ID and a projected post-sale tank/group balance per transaction.';
