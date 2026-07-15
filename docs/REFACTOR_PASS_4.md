# Refactor Pass 4

Date: 2026-07-13

## TypeScript corrections

- Typed forecourt event payloads as key-value records and guarded UI rendering of `action` and `pumpId`.
- Completed `SessionUser` fixtures in DOMS maintenance tests with email and station metadata.
- Added explicit command-builder null and data guards in optional-module and wetstock tests.
- Allowed `lastReject` to be explicitly reset to `null` in JPL adapter state.

## API boundary work

- Added `GET /api/admin/products/page-data` for the complete products page bootstrap contract.
- Replaced products page application queries with an abort-safe client loader and skeleton.
- Replaced proxy settings page application execution with the existing admin API and a client loader.
- Expanded fiscal inbox detail GET to include the detail row, related transaction, editable product catalog, and decimal settings.
- Replaced fiscal inbox detail page queries with an API-backed client loader.
- Removed all remaining application-query and shared-server imports from `page.tsx` files.

## Compatibility

- Existing product mutations, proxy settings updates, fiscal inbox actions, replay controls, and related transaction editing remain unchanged.
- DOMS migration foreign keys remain corrected to `fuel_stations(id)`.
