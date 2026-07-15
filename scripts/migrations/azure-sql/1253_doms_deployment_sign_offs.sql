IF OBJECT_ID('forecourt_doms_deployment_sign_offs', 'U') IS NULL
BEGIN
  CREATE TABLE forecourt_doms_deployment_sign_offs (
    sign_off_id UNIQUEIDENTIFIER NOT NULL PRIMARY KEY,
    station_id UNIQUEIDENTIFIER NOT NULL,
    acceptance_digest NVARCHAR(128) NOT NULL,
    deployment_artifact NVARCHAR(512) NOT NULL,
    pss_target_fingerprint NVARCHAR(512) NOT NULL,
    decision NVARCHAR(16) NOT NULL,
    exceptions NVARCHAR(MAX) NOT NULL DEFAULT '[]',
    signed_by_user_id UNIQUEIDENTIFIER NOT NULL,
    signed_at DATETIMEOFFSET NOT NULL,
    readiness_generated_at DATETIMEOFFSET NOT NULL,
    production_release_status NVARCHAR(64) NOT NULL,
    blocking_item_count INT NOT NULL,
    created_at DATETIMEOFFSET NOT NULL DEFAULT SYSDATETIMEOFFSET(),
    CONSTRAINT CK_doms_deployment_sign_offs_decision
      CHECK (decision IN ('approved', 'rejected')),
    CONSTRAINT CK_doms_deployment_sign_offs_blocking_count
      CHECK (blocking_item_count >= 0)
  );

  CREATE INDEX idx_doms_deployment_sign_offs_lookup
    ON forecourt_doms_deployment_sign_offs (
      station_id, acceptance_digest, pss_target_fingerprint, decision, signed_at DESC
    );
END;
