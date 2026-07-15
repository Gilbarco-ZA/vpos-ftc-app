IF OBJECT_ID('forecourt_doms_maintenance_execution_claims', 'U') IS NULL
BEGIN
  CREATE TABLE forecourt_doms_maintenance_execution_claims (
    permit_id NVARCHAR(128) NOT NULL PRIMARY KEY,
    station_id UNIQUEIDENTIFIER NOT NULL,
    session_id NVARCHAR(128) NOT NULL,
    command_name NVARCHAR(128) NOT NULL,
    command_digest NVARCHAR(128) NOT NULL,
    user_id UNIQUEIDENTIFIER NOT NULL,
    status NVARCHAR(16) NOT NULL,
    response NVARCHAR(MAX) NULL,
    error_text NVARCHAR(MAX) NULL,
    claimed_at DATETIMEOFFSET NOT NULL,
    completed_at DATETIMEOFFSET NULL,
    created_at DATETIMEOFFSET NOT NULL DEFAULT SYSDATETIMEOFFSET(),
    CONSTRAINT CK_doms_maintenance_execution_claims_status
      CHECK (status IN ('claimed', 'succeeded', 'failed'))
  );

  CREATE INDEX idx_doms_maintenance_execution_claims_station_time
    ON forecourt_doms_maintenance_execution_claims (station_id, claimed_at DESC);
END;
