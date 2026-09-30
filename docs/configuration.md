# Configuration

**Type:** authoritative

## Precedence

For application-owned environment settings, precedence is:

1. non-empty process environment;
2. approved persisted station `env:NAME` value;
3. code default from `src/platform/runtime/env-defaults.cjs`.

Typed configuration belongs in purpose-specific tables. `station_kv` is limited to bounded setup, integration, compatibility, and operational state approved by the station KV policy.

## Ownership

- Station identity and typed station settings are PostgreSQL-owned.
- Country catalogs are owned by `country_datasets` and `country_dataset_rows`.
- Bundled country data is seed/default material, not mutable runtime authority.
- PSS XML and filesystem sources are compatibility or integration inputs.
- Secrets should be injected through secure deployment configuration, not stored in source or public assets.

## HTTPS

`VPOS_USE_HTTPS=1` requires explicit `VPOS_HTTPS_KEY_PATH` and `VPOS_HTTPS_CERT_PATH`. No public-directory or silent HTTP fallback is allowed.

## Destructive changes

Before retiring a legacy column, table, queue, file store, or compatibility read:

1. run the relevant audit command;
2. verify all deployed versions and external consumers;
3. capture backups and a rollback plan;
4. execute during an approved maintenance window;
5. run post-retirement verification.

See the [storage retirement runbook](runbooks/storage-retirement.md).

## VPOS proxy settings

`/admin/proxy-settings` reads and updates the live vpos-proxy configuration through `GET` and `PATCH /proxy/settings`. It exposes the cloud, internal, and Tanzania Swagger endpoint settings, including `swaggerEndpointTanzania` (`VPOS_SWAGGER_ENDPOINT_TANZANIA` on vpos-proxy). Endpoint resolution uses an explicitly persisted proxy URL first, then the configured DOMS/JPL host on port `5555`, and finally `VPOS_PROXY_URL` or the loopback default.

`vpos-ftc-app` does not connect to Azure SQL or any other cloud database. The retired `AZURE_SQL_*`, `VPOS_FISCALIZATION_SYNC_MODE`, and `VPOS_FISCALIZATION_SYNC_CUTOVER_ACK` settings are not supported. Cloud delivery, retry, offline queueing, and country-specific endpoint routing are owned by `vpos-proxy`. The old station push/pull sync actions and cloud-customer import are retired; customer records remain station-owned PostgreSQL data.

## Tanzania cumulative gross total

`station_settings.tanzania_gross_total_opening` is the typed opening balance for
the lifetime Tanzania `grossTotal`. Administrators maintain it on
`/admin/tanzania-fiscal`. Daily-total compilation adds fiscal turnover recorded
by the current installation through the report business date. The numeric
default is `0.00`, but an administrator must explicitly capture that value to confirm a new station baseline. A replacement machine at an
existing station uses the last accepted `grossTotal` from the retired machine
before local transaction accumulation begins. The capture timestamp is stored
in `station_settings.tanzania_gross_total_opening_captured_at`.

## Tanzania device ID override

`station_settings.tanzania_device_id_override` remains an optional administrator-owned
value maintained on `/admin/tanzania-fiscal` for compatibility. FTC no longer sends
this value as `deviceId` or `x-device-id` in Tanzania invoice, daily-total, or tank
inventory submissions; effective device identity and EWURA licence values are now
resolved by the cloud service.

## Tanzania daily totals schedule

`station_settings.tanzania_daily_totals_send_time` is the administrator-owned
station-local wall-clock time for automatic Tanzania daily-total submission. It
uses `HH:mm` semantics and defaults to `00:00`. The runtime worker may poll more
frequently, but it creates the previous closed business-day report only after
this local time is reached. Administrators maintain the value from
`/tanzania/daily-totals`; the worker rereads it while running, so a process
restart is not required.

## PostgreSQL pool

The FTC PostgreSQL pool is process-global so separate compiled server module graphs cannot multiply the connection limit within one Node.js process. The master-compatible defaults remain 20 connections, a 30 second idle timeout, and a 10 second connection-acquisition timeout. Operators may tune these values with bounded environment settings:

- `POSTGRES_POOL_MAX` (default `20`, allowed `2`-`50`)
- `POSTGRES_POOL_IDLE_TIMEOUT_MS` (default `30000`, allowed `1000`-`300000`)
- `POSTGRES_POOL_CONNECTION_TIMEOUT_MS` (default `10000`, allowed `1000`-`60000`)

Increasing the pool should not be used to mask a forecourt polling or bootstrap fan-out problem; inspect PostgreSQL `waitingCount` and the JPL lifecycle first.

## Forecourt runtime backpressure

The DOMS/JPL runtime reserves database capacity for foreground UI/API work rather than allowing polling and worker timers to acquire the entire PostgreSQL pool. The defaults are deliberately conservative because deployed DOMS controllers can return valid solicited responses without correlation IDs.

- `VPOS_JPL_FALLBACK_POLL_MS` (default `60000`, bounded to `60000`-`300000`): interval for low-frequency fallback polling after startup reconciliation.
- `VPOS_JPL_BUFFER_STALE_MS` (default `180000`, bounded to `60000`-`900000`): transaction-buffer status age before fallback polling considers that pump/mode stale.
- `VPOS_JPL_FALLBACK_BUFFER_BATCH` (default `8`, allowed `1`-`32`): maximum stale pump/mode buffer requests in one fallback cycle.
- `VPOS_JPL_FALLBACK_REQUEST_GAP_MS` (default `75`, allowed `0`-`1000`): pacing gap between fallback transaction-buffer requests.
- `VPOS_JPL_STARTUP_RECONCILIATION_GAP_MS` (default `40`, allowed `0`-`500`): baseline gap between startup buffer reconciliation requests; additional delay is applied automatically while the PostgreSQL pool is under pressure.
- `VPOS_JPL_PERSIST_CONCURRENCY` (default `2`, allowed `1`-`4`): maximum concurrent JPL event-history persistence operations.
- `VPOS_JPL_EVENT_CONCURRENCY` (default `1`, allowed `1`-`2`): maximum concurrent normal JPL event/replay handlers. Keep the default unless the site controller is proven to echo correlation IDs consistently.
- `VPOS_JPL_REQUEST_CONCURRENCY` (default `8`, allowed `1`-`32`): maximum solicited JPL requests allowed only while the vendor client reports correlated-concurrent dispatch. The shared request gate automatically collapses to exactly one in-flight request whenever correlation support is unknown or unavailable.
- `VPOS_JPL_RECENT_CLEAR_STALE_GRACE_MS` (default `30000`, allowed `1000`-`120000`): short suppression window for a DOMS buffer snapshot that still reports this POS lock for a transaction whose clear was already verified. This is not a lifetime terminal rule; DEC4 sequence reuse remains eligible after the grace window or whenever the entry is not still owned by this POS.
- `VPOS_FORECOURT_MATERIALIZATION_CONCURRENCY` (default `2`, allowed `1`-`4`): maximum concurrent best-effort forecourt state materialization transactions.
- `VPOS_RUNTIME_DIAGNOSTICS_MS` (default `30000`, bounded to `10000`-`300000`): runtime health log interval for memory, PostgreSQL pool, JPL persistence/event queues, and forecourt materialization pressure.

High-frequency POS and transaction-queue workers are process-local single-flight and skip new loop/heartbeat work while PostgreSQL already has waiting clients. PostgreSQL session advisory locks retain the exact pooled client that acquired the lock until unlock; they must never be acquired and released through independent pool queries.

## ATG polling

ATG polling is owned by typed `station_settings` columns rather than `station_kv`. `atg_polling_enabled` defaults to `false`, and `atg_polling_interval_seconds` defaults to 600 seconds (10 minutes). Administrators and managers configure these values from `/settings/tanks`. The runtime worker refreshes the settings while running, so changing the enabled state or interval does not require a process restart. Each successful `GET_ALL_TG_DATA` poll replaces the station's local `tank_atg_snapshots` row for each configured tank; local ATG history is not retained because long-term history is stored by the cloud service.
