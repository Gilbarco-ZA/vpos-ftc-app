-- Phase 5B: make country_dataset_rows the canonical runtime country catalog.
-- This migration is intentionally non-destructive. It adds compatibility views,
-- retirement metadata, and lookup indexes, but does not drop or rewrite cfg_* tables.

ALTER TABLE country_datasets
    ADD COLUMN IF NOT EXISTS content_hash TEXT;

ALTER TABLE country_datasets
    DROP CONSTRAINT IF EXISTS ck_country_datasets_content_hash;
ALTER TABLE country_datasets
    ADD CONSTRAINT ck_country_datasets_content_hash
    CHECK (content_hash IS NULL OR content_hash ~ '^[0-9a-f]{64}$') NOT VALID;

COMMENT ON COLUMN country_datasets.content_hash IS
    'SHA-256 of the normalized canonical country dataset rows. Updated by application import, row-edit, bootstrap, or explicit bundled reset paths.';

CREATE INDEX IF NOT EXISTS idx_country_dataset_rows_active_catalog_lookup
    ON country_dataset_rows (country_code, dataset_type, sort_order, name, code)
    WHERE is_active = TRUE;

COMMENT ON TABLE country_datasets IS
    'Canonical country catalog headers. Runtime country configuration must resolve through this table and country_dataset_rows.';
COMMENT ON TABLE country_dataset_rows IS
    'Canonical country-scoped tax, product, credit-note, packaging, and unit catalog rows.';

COMMENT ON TABLE cfg_tax_types IS
    'DEPRECATED duplicate country catalog. Use country_dataset_rows dataset_type=taxTypes. Retire only after country:catalog:audit --require-safe passes.';
COMMENT ON TABLE cfg_product_class_codes IS
    'DEPRECATED duplicate country catalog. Use country_dataset_rows dataset_type=productClassCodes.';
COMMENT ON TABLE cfg_product_type_codes IS
    'DEPRECATED duplicate country catalog. Use country_dataset_rows dataset_type=productTypeCodes.';
COMMENT ON TABLE cfg_credit_note_reasons IS
    'DEPRECATED duplicate country catalog. Use country_dataset_rows dataset_type=creditNoteReasons.';
COMMENT ON TABLE cfg_pack_sizes IS
    'DEPRECATED duplicate country catalog. Use country_dataset_rows dataset_type=packagingUnits.';
COMMENT ON TABLE cfg_units_of_measure IS
    'DEPRECATED duplicate country catalog. Use country_dataset_rows dataset_type=quantityUnits.';

CREATE OR REPLACE VIEW country_catalog_cfg_tax_types_compat AS
SELECT r.country_code,
       r.id,
       r.code,
       r.name,
       r.description,
       r.rate,
       r.is_active,
       r.sort_order,
       r.created_at,
       r.updated_at
  FROM country_dataset_rows r
  JOIN country_datasets d ON d.country_code = r.country_code
 WHERE r.dataset_type = 'taxTypes'
   AND d.is_active = TRUE;

CREATE OR REPLACE VIEW country_catalog_cfg_product_class_codes_compat AS
SELECT r.country_code,
       r.id,
       r.code,
       r.name,
       r.description,
       r.is_active,
       r.sort_order,
       r.created_at,
       r.updated_at
  FROM country_dataset_rows r
  JOIN country_datasets d ON d.country_code = r.country_code
 WHERE r.dataset_type = 'productClassCodes'
   AND d.is_active = TRUE;

CREATE OR REPLACE VIEW country_catalog_cfg_product_type_codes_compat AS
SELECT r.country_code,
       r.id,
       r.code,
       r.name,
       r.description,
       r.is_active,
       r.sort_order,
       r.created_at,
       r.updated_at
  FROM country_dataset_rows r
  JOIN country_datasets d ON d.country_code = r.country_code
 WHERE r.dataset_type = 'productTypeCodes'
   AND d.is_active = TRUE;

CREATE OR REPLACE VIEW country_catalog_cfg_credit_note_reasons_compat AS
SELECT r.country_code,
       r.id,
       r.code,
       r.name,
       r.description,
       r.is_active,
       r.sort_order,
       r.created_at,
       r.updated_at
  FROM country_dataset_rows r
  JOIN country_datasets d ON d.country_code = r.country_code
 WHERE r.dataset_type = 'creditNoteReasons'
   AND d.is_active = TRUE;

CREATE OR REPLACE VIEW country_catalog_cfg_pack_sizes_compat AS
SELECT r.country_code,
       r.id,
       r.code,
       r.name,
       r.description,
       r.is_active,
       r.sort_order,
       r.created_at,
       r.updated_at
  FROM country_dataset_rows r
  JOIN country_datasets d ON d.country_code = r.country_code
 WHERE r.dataset_type = 'packagingUnits'
   AND d.is_active = TRUE;

CREATE OR REPLACE VIEW country_catalog_cfg_units_of_measure_compat AS
SELECT r.country_code,
       r.id,
       r.code,
       r.name,
       r.description,
       r.is_active,
       r.sort_order,
       r.created_at,
       r.updated_at
  FROM country_dataset_rows r
  JOIN country_datasets d ON d.country_code = r.country_code
 WHERE r.dataset_type = 'quantityUnits'
   AND d.is_active = TRUE;

CREATE OR REPLACE VIEW country_catalog_legacy_table_map AS
SELECT *
  FROM (VALUES
    ('cfg_tax_types', 'taxTypes', 'country_catalog_cfg_tax_types_compat'),
    ('cfg_product_class_codes', 'productClassCodes', 'country_catalog_cfg_product_class_codes_compat'),
    ('cfg_product_type_codes', 'productTypeCodes', 'country_catalog_cfg_product_type_codes_compat'),
    ('cfg_credit_note_reasons', 'creditNoteReasons', 'country_catalog_cfg_credit_note_reasons_compat'),
    ('cfg_pack_sizes', 'packagingUnits', 'country_catalog_cfg_pack_sizes_compat'),
    ('cfg_units_of_measure', 'quantityUnits', 'country_catalog_cfg_units_of_measure_compat')
  ) AS mapping(legacy_table, dataset_type, compatibility_view);

COMMENT ON VIEW country_catalog_legacy_table_map IS
    'Rollback/consumer migration map from deprecated cfg_* tables to country-scoped compatibility views.';

COMMENT ON VIEW country_catalog_cfg_tax_types_compat IS
    'Country-scoped compatibility shape for consumers migrating from cfg_tax_types. Filter by country_code.';
COMMENT ON VIEW country_catalog_cfg_product_class_codes_compat IS
    'Country-scoped compatibility shape for consumers migrating from cfg_product_class_codes. Filter by country_code.';
COMMENT ON VIEW country_catalog_cfg_product_type_codes_compat IS
    'Country-scoped compatibility shape for consumers migrating from cfg_product_type_codes. Filter by country_code.';
COMMENT ON VIEW country_catalog_cfg_credit_note_reasons_compat IS
    'Country-scoped compatibility shape for consumers migrating from cfg_credit_note_reasons. Filter by country_code.';
COMMENT ON VIEW country_catalog_cfg_pack_sizes_compat IS
    'Country-scoped compatibility shape for consumers migrating from cfg_pack_sizes. Filter by country_code.';
COMMENT ON VIEW country_catalog_cfg_units_of_measure_compat IS
    'Country-scoped compatibility shape for consumers migrating from cfg_units_of_measure. Filter by country_code.';
