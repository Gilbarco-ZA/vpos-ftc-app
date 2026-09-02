# Country Catalog Ownership

This document defines the canonical owner, runtime access contract, compatibility boundary, and retirement procedure for country-specific tax and product reference data.

## Canonical owner

The mutable runtime catalog is stored in:

- `country_datasets`: one country-level catalog header, activation state, version metadata, and deterministic content hash;
- `country_dataset_rows`: country-scoped rows grouped by `dataset_type`.

Bundled TypeScript datasets are immutable seed/default material. They bootstrap a missing catalog and support an explicit reset operation, but they are not the runtime authority after the database catalog exists.

The legacy global `cfg_*` tables are compatibility storage only:

| Legacy table              | Canonical dataset type |
| ------------------------- | ---------------------- |
| `cfg_tax_types`           | `taxTypes`             |
| `cfg_product_class_codes` | `productClassCodes`    |
| `cfg_product_type_codes`  | `productTypeCodes`     |
| `cfg_credit_note_reasons` | `creditNoteReasons`    |
| `cfg_pack_sizes`          | `packagingUnits`       |
| `cfg_units_of_measure`    | `quantityUnits`        |

New runtime code must not read or write these tables.

## Country scope

Every runtime catalog lookup must resolve a country explicitly from one of these inputs:

1. the station's persisted country;
2. an explicit country code supplied by a controlled administrative operation;
3. a deployment audit argument.

Country codes are normalized to uppercase two- or three-character codes. A lookup must not silently fall back to an arbitrary country when multiple station countries are present.

The typed runtime adapter is:

```text
src/shared/server/config/countryCatalog.ts
```

It is the approved boundary for active catalog rows and default tax-type resolution. Direct SQL against `cfg_*` tables is prohibited in application runtime code.

## Dataset integrity and versioning

`country_datasets.content_hash` is a deterministic SHA-256 digest of the normalized, sorted database rows for the country. It is refreshed after bootstrap, row edits, and explicit resets.

The hash provides:

- a stable comparison point for deployment and support diagnostics;
- drift detection between canonical and compatibility data;
- a rollback checkpoint before destructive cleanup;
- evidence that an administrative edit changed the active catalog.

The hash is diagnostic integrity metadata, not a replacement for database constraints or backups.

## Administrative behavior

Administrative row edits write directly to `country_dataset_rows`; runtime readers therefore observe approved changes without a secondary seed/copy operation.

The explicit reset action replaces the selected country's mutable rows with bundled defaults and recalculates the content hash:

```text
reset-to-bundled-defaults
```

A reset is destructive to administrator edits for that country. It must be treated as an operator action and must not run during normal startup or silently overwrite database data.

## Compatibility views

Migration `1264_country_catalog_canonical.sql` creates country-scoped compatibility views:

- `country_catalog_cfg_tax_types_compat`;
- `country_catalog_cfg_product_class_codes_compat`;
- `country_catalog_cfg_product_type_codes_compat`;
- `country_catalog_cfg_credit_note_reasons_compat`;
- `country_catalog_cfg_pack_sizes_compat`;
- `country_catalog_cfg_units_of_measure_compat`.

Each view includes `country_code`. External SQL consumers must filter by country and migrate to the canonical tables or typed API. The views deliberately do not impersonate the unscoped legacy table names because doing so would preserve the original cross-country ambiguity.

`country_catalog_legacy_table_map` records the legacy-to-canonical mapping for audits and rollback planning.

## Retirement audit

Run the audit for an explicit country when a deployment contains multiple station countries:

```bash
npm run country:catalog:audit -- --country TZ
npm run country:catalog:audit -- --country TZ --require-safe
```

For a deployment with exactly one active station country, the country argument may be omitted:

```bash
npm run country:catalog:audit
npm run country:catalog:audit -- --require-safe
```

The audit checks:

- that migration `1264_country_catalog_canonical.sql` is installed;
- that the country resolves unambiguously;
- that an active canonical dataset exists;
- that all required dataset groups contain rows;
- that the canonical content hash is present and valid;
- that every legacy table is row-equivalent to the selected country catalog;
- that the compatibility views exist;
- that PostgreSQL views, materialized views, functions, and triggers do not depend on the legacy tables.

`--require-safe` exits non-zero unless every destructive-retirement condition passes. A passing result is necessary but not sufficient: site scripts, reporting tools, older binaries, cloud schemas, backups, and rollback procedures must also be checked.

## Destructive retirement gate

Do not drop a `cfg_*` table until all of the following are true:

1. the repository contains no runtime reader or writer;
2. the deployment audit passes for every active country;
3. external SQL/reporting consumers have migrated or use the country-scoped compatibility views;
4. the canonical content hash and row counts have been recorded;
5. a production-like restore and rollback have been tested;
6. the compatible application version has completed a release soak;
7. older binaries that require unscoped `cfg_*` tables are retired.

Phase 5B does not drop, truncate, or clear any legacy table.

## Rollback

Before a destructive migration:

- export each legacy table;
- record the canonical country code, row counts by dataset type, and content hash;
- retain migration `1264` compatibility views and mapping metadata;
- verify the bundled-default reset independently from backup restoration.

Rollback should restore the exported legacy tables only for an older binary that still requires them. The canonical country tables remain the source of truth for current versions.

## Rules for new work

1. Add new country reference values as a documented `dataset_type` under the canonical tables.
2. Resolve country before reading catalog data.
3. Use typed adapters rather than table-name SQL in feature modules.
4. Do not copy canonical rows into a second mutable runtime table.
5. Do not silently reset administrator-managed data during startup.
6. Update the deterministic content hash after every catalog mutation.
7. Add audit and compatibility mappings before retiring any older representation.
