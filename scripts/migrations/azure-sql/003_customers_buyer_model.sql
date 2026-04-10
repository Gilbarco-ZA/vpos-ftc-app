ALTER TABLE customers
  ADD buyer_name NVARCHAR(255) NULL,
      buyer_type NVARCHAR(45) NULL,
      pin NVARCHAR(50) NULL,
      passport_number NVARCHAR(45) NULL,
      business_name NVARCHAR(255) NULL,
      tax_tin NVARCHAR(50) NULL,
      tax_ninbrn NVARCHAR(50) NULL,
      address_street NVARCHAR(255) NULL,
      address_city NVARCHAR(100) NULL,
      address_state NVARCHAR(100) NULL,
      address_province NVARCHAR(100) NULL,
      address_postal_code NVARCHAR(20) NULL,
      address_country_code NVARCHAR(2) NULL,
      contact_phone NVARCHAR(50) NULL,
      contact_mobile NVARCHAR(50) NULL,
      contact_fax NVARCHAR(50) NULL,
      contact_email NVARCHAR(255) NULL,
      contact_website NVARCHAR(255) NULL,
      contact_person NVARCHAR(255) NULL;

UPDATE customers
   SET buyer_name = ISNULL(buyer_name, trade_name);

UPDATE customers
   SET tax_tin = ISNULL(tax_tin, tin);

ALTER TABLE customers
  ALTER COLUMN buyer_name NVARCHAR(255) NOT NULL;

ALTER TABLE customers
  ALTER COLUMN tax_tin NVARCHAR(50) NOT NULL;

CREATE UNIQUE INDEX idx_customers_country_tax_tin_unique ON customers(country, tax_tin);
CREATE INDEX idx_customers_tax_tin ON customers(tax_tin);
CREATE INDEX idx_customers_buyer_name ON customers(buyer_name);
CREATE INDEX idx_customers_station_tax_tin ON customers(last_station_id, tax_tin);
CREATE INDEX idx_customers_station_buyer_name ON customers(last_station_id, buyer_name);

DROP INDEX idx_customers_search ON customers;
CREATE INDEX idx_customers_search ON customers(
  buyer_name,
  tax_tin,
  country
);
