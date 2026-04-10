-- Remove legacy columns and indexes (Azure SQL)

-- Customers: drop legacy identity and address fields
IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.customers') AND name = 'tin')
  ALTER TABLE dbo.customers DROP COLUMN tin;

IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.customers') AND name = 'trade_name')
  ALTER TABLE dbo.customers DROP COLUMN trade_name;

IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.customers') AND name = 'contact_name')
  ALTER TABLE dbo.customers DROP COLUMN contact_name;

IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.customers') AND name = 'contact_number')
  ALTER TABLE dbo.customers DROP COLUMN contact_number;

IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.customers') AND name = 'address_line_1')
  ALTER TABLE dbo.customers DROP COLUMN address_line_1;

IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.customers') AND name = 'address_line_2')
  ALTER TABLE dbo.customers DROP COLUMN address_line_2;

IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.customers') AND name = 'city')
  ALTER TABLE dbo.customers DROP COLUMN city;

-- Drop legacy constraints/indexes
IF EXISTS (SELECT 1 FROM sys.key_constraints WHERE name = 'UQ_customers_country_tin')
  ALTER TABLE dbo.customers DROP CONSTRAINT UQ_customers_country_tin;

IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'idx_customers_tin' AND object_id = OBJECT_ID('dbo.customers'))
  DROP INDEX idx_customers_tin ON dbo.customers;

IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'idx_customers_country_tin' AND object_id = OBJECT_ID('dbo.customers'))
  DROP INDEX idx_customers_country_tin ON dbo.customers;

IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'idx_customers_trade_name' AND object_id = OBJECT_ID('dbo.customers'))
  DROP INDEX idx_customers_trade_name ON dbo.customers;

-- Transactions: drop legacy filename if present
IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.transactions') AND name = 'legacy_filename')
  ALTER TABLE dbo.transactions DROP COLUMN legacy_filename;

IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'idx_transactions_station_legacy_filename' AND object_id = OBJECT_ID('dbo.transactions'))
  DROP INDEX idx_transactions_station_legacy_filename ON dbo.transactions;

-- Reports: drop legacy filename if present
IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.reports') AND name = 'legacy_filename')
  ALTER TABLE dbo.reports DROP COLUMN legacy_filename;

IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'idx_reports_station_legacy_filename' AND object_id = OBJECT_ID('dbo.reports'))
  DROP INDEX idx_reports_station_legacy_filename ON dbo.reports;
