-- 022_linking_window_default_30_seconds.sql
-- Set the station settings linking window default to 30 seconds for existing databases.

DECLARE @constraint_name NVARCHAR(128);

SELECT @constraint_name = dc.name
FROM sys.default_constraints dc
INNER JOIN sys.columns c
  ON c.default_object_id = dc.object_id
INNER JOIN sys.tables t
  ON t.object_id = c.object_id
WHERE t.name = 'station_settings'
  AND c.name = 'linking_window_seconds';

IF @constraint_name IS NOT NULL
BEGIN
  EXEC('ALTER TABLE station_settings DROP CONSTRAINT ' + QUOTENAME(@constraint_name));
END

ALTER TABLE station_settings
  ADD CONSTRAINT df_station_settings_linking_window_seconds DEFAULT 30 FOR linking_window_seconds;
