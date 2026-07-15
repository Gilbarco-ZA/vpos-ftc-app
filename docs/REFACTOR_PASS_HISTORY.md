# Refactor Pass History

## Pass 1 - UI/API boundaries and repository guardrails

Date: 2026-07-13

### Changes

- Replaced direct database access in the station settings page with the existing `/api/admin/settings` endpoint.
- Added a loading skeleton and API error state for station settings.
- Added `GET /api/settings/pumps/[id]` with application and repository layers.
- Replaced direct pump database access in the pump detail page with the new endpoint.
- Added a loading skeleton and API error state for pump details.
- Added `npm run check:architecture` to prevent new page imports from database and infrastructure layers.
- Captured existing page-boundary debt in `.agent/page-boundary-baseline.json`; the baseline must shrink as pages are refactored.
- Consolidated historical DOMS integration pass files into `docs/DOMS_INTEGRATION_HISTORY.md`.

### Compatibility

- Existing authentication and role checks remain at the route-page boundary.
- Existing form components, API mutation behavior, pump websocket updates, and nozzle management remain unchanged.
- No database schema changes were introduced.

## Pass 2 - Page boundary completion and bootstrap API routing

Date: 2026-07-13

### Completed

- Removed the final three direct page-to-database/infrastructure imports.
- Reduced the architecture baseline from three known violations to zero.
- Added a shared bootstrap status API contract for login, setup, and root routing.
- Extended `GET /api/bootstrap/status` with proxy reachability and device registration state.
- Replaced server-side bootstrap/database execution in `/`, `/login`, and `/setup` with API-backed client gates.
- Added reusable page skeletons for bootstrap transitions.
- Moved `ForecourtEventRow` from the infrastructure repository to a public forecourt contract.
- Removed synchronous prop-derived state mirroring from the setup wizard.
- Deferred local-storage step restoration to avoid synchronous state updates inside an effect body.

### Architecture result

`npm run check:architecture` now reports zero known violations.

### Follow-up

The next boundary pass should target page imports from application query modules, beginning with POS and fiscal inbox pages. Authentication guards may remain server-side because they are access-control boundaries rather than domain execution.

## Pass 3 - API-backed POS and fiscal inbox pages

- Corrected DOMS migration foreign keys in migrations `1252` and `1253` to reference `fuel_stations(id)`.
- Added `GET /api/pos/catalog` as the canonical UI contract for POS catalog data, category filtering, decimal settings, and role-specific transaction navigation.
- Replaced direct POS page application queries with an abort-safe client loader and loading skeleton.
- Updated the fiscal inbox list API to return presentation-ready rows.
- Replaced direct fiscal inbox page queries with API hydration through the existing client surface.
- Replaced the fiscal inbox text loading state with a reusable table skeleton.
- Kept page files declarative and free of domain query, database, and infrastructure execution.

## Pass 4 - Type safety fixes and remaining page query removal

- Fixed the 25 reported TypeScript errors across forecourt UI state and DOMS tests.
- Added API-backed page bootstrap for admin products and proxy settings.
- Expanded the fiscal inbox detail API and converted its page to an API loader.
- Removed all remaining application-query and shared-server imports from page components.
- Preserved the zero-violation hard architecture boundary.
