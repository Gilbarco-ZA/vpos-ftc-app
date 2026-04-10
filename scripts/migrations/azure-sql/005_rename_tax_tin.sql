-- Rename tax_tin to tin and update indexes (Azure SQL)

IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.customers') AND name = 'tax_tin')
  EXEC sp_rename 'dbo.customers.tax_tin', 'tin', 'COLUMN';

IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'idx_customers_country_tax_tin_unique' AND object_id = OBJECT_ID('dbo.customers'))
  DROP INDEX idx_customers_country_tax_tin_unique ON dbo.customers;

IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'idx_customers_tax_tin' AND object_id = OBJECT_ID('dbo.customers'))
  DROP INDEX idx_customers_tax_tin ON dbo.customers;

IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'idx_customers_station_tax_tin' AND object_id = OBJECT_ID('dbo.customers'))
  DROP INDEX idx_customers_station_tax_tin ON dbo.customers;

CREATE UNIQUE INDEX idx_customers_country_tin_unique ON dbo.customers(country, tin);
CREATE INDEX idx_customers_tin ON dbo.customers(tin);
CREATE INDEX idx_customers_station_tin ON dbo.customers(last_station_id, tin);
