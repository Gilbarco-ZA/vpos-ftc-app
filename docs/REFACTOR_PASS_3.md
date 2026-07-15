# Refactor Pass 3

## Scope

This pass continued the page-to-API boundary migration for the POS and fiscal inbox user interfaces while correcting two DOMS migration foreign keys.

## Migration corrections

The following migrations now reference the canonical station table:

- `scripts/migrations/postgres/1252_doms_maintenance_execution_claims.sql`
- `scripts/migrations/postgres/1253_doms_deployment_sign_offs.sql`

Both use:

```sql
station_id UUID NOT NULL REFERENCES fuel_stations(id) ON DELETE CASCADE
```

## POS boundary

`/pos` now renders a client loader. The loader requests `GET /api/pos/catalog`, which owns:

- authenticated station scoping;
- product and category queries;
- exclusion of fuel categories from manual POS sales;
- station decimal settings;
- role-specific transaction navigation.

The UI page no longer invokes application queries or server settings helpers.

## Fiscal inbox boundary

`/transaction/fiscal-inbox` now hydrates through `GET /api/runtime/fiscal/inbox` rather than invoking the application query from the page. The API returns presentation-ready list rows, keeping persistence shapes out of the UI.

## Loading behavior

- POS uses `PageSkeleton` during catalog hydration.
- Fiscal inbox uses `TableSkeleton` while refreshing.
- Requests use existing API authorization and station scoping.

## Local verification

```bash
npm run lint
npm run check:architecture
npm run test
npm run build
```
