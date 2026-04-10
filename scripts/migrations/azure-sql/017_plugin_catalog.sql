-- Plugin/Process Catalog (filesystem discovery -> DB)
-- Migration: 017_plugin_catalog.sql

IF NOT EXISTS (SELECT * FROM sysobjects WHERE name = 'process_catalog' AND xtype = 'U')
BEGIN
  CREATE TABLE process_catalog (
    process_type NVARCHAR(128) NOT NULL PRIMARY KEY,
    schema_json NVARCHAR(MAX) NOT NULL DEFAULT('{}'),
    source_path NVARCHAR(512) NULL,
    created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    updated_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
  );
END;

IF NOT EXISTS (SELECT * FROM sysobjects WHERE name = 'plugin_catalog' AND xtype = 'U')
BEGIN
  CREATE TABLE plugin_catalog (
    plugin_name NVARCHAR(128) NOT NULL PRIMARY KEY,
    metadata_json NVARCHAR(MAX) NOT NULL DEFAULT('{}'),
    schemas_json NVARCHAR(MAX) NOT NULL DEFAULT('{}'),
    source_path NVARCHAR(512) NULL,
    created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    updated_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
  );
END;

IF NOT EXISTS (
  SELECT 1 FROM sys.indexes WHERE name = 'idx_plugin_catalog_updated_at'
)
BEGIN
  CREATE INDEX idx_plugin_catalog_updated_at ON plugin_catalog (updated_at);
END;