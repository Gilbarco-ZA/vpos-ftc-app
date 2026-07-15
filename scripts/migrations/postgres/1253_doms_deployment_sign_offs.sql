CREATE TABLE IF NOT EXISTS forecourt_doms_deployment_sign_offs (
  sign_off_id UUID PRIMARY KEY,
  station_id UUID NOT NULL REFERENCES fuel_stations(id) ON DELETE CASCADE,
  acceptance_digest TEXT NOT NULL,
  deployment_artifact TEXT NOT NULL,
  pss_target_fingerprint TEXT NOT NULL,
  decision TEXT NOT NULL CHECK (decision IN ('approved', 'rejected')),
  exceptions JSONB NOT NULL DEFAULT '[]'::jsonb,
  signed_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  signed_at TIMESTAMPTZ NOT NULL,
  readiness_generated_at TIMESTAMPTZ NOT NULL,
  production_release_status TEXT NOT NULL,
  blocking_item_count INTEGER NOT NULL CHECK (blocking_item_count >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_doms_deployment_sign_offs_lookup
  ON forecourt_doms_deployment_sign_offs (
    station_id, acceptance_digest, pss_target_fingerprint, decision, signed_at DESC
  );
