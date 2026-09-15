# Configuration

**Type:** authoritative

## Production configuration principle

Production VPOS runs as a secure packaged application on the DOMS controller. Field technicians and site managers do not require SSH, terminal, filesystem, source-code, or `.env` access to configure a station.

Site-specific production adjustments should be made through the supported VPOS application screens and approved DOMS/PSS administration workflows. `.env` files are a development convenience only and are not a production field-configuration mechanism.

## Runtime precedence

At implementation/runtime level, application-owned environment settings resolve in this order:

1. non-empty process environment supplied by the managed deployment runtime;
2. approved persisted station `env:NAME` value;
3. code default from `src/platform/runtime/env-defaults.cjs`.

This precedence is an implementation detail, not a field-support procedure. Production field staff should not attempt to create or modify process environment values. Any deployment-level secure override that is not exposed through VPOS is owned by the controlled package/deployment process.

Typed configuration belongs in purpose-specific tables. `station_kv` is limited to bounded setup, integration, compatibility, and operational state approved by the station KV policy.

## Ownership

- Station identity and typed station settings are PostgreSQL-owned and maintained through supported application workflows.
- Country catalogs are owned by `country_datasets` and `country_dataset_rows`.
- Bundled country data is seed/default material, not mutable runtime authority.
- PSS XML and filesystem sources are compatibility or integration inputs.
- DOMS/PSS-owned settings must be changed through the approved DOMS/PSS configuration process.
- Secrets and secure artifacts are provisioned through controlled deployment/security mechanisms and must not be placed in source, public assets, screenshots, or support tickets.

## HTTPS

HTTPS configuration is deployment-owned. `VPOS_USE_HTTPS=1` requires explicit `VPOS_HTTPS_KEY_PATH` and `VPOS_HTTPS_CERT_PATH` at runtime. No public-directory or silent HTTP fallback is allowed.

Field staff must not copy, edit, or relocate certificate/private-key material through unsupported filesystem access. Use only the approved deployment or application workflow available for the installed platform.

## Destructive changes

Before retiring a legacy column, table, queue, file store, or compatibility read:

1. run the relevant engineering audit in a supported engineering environment;
2. verify all deployed versions and external consumers;
3. capture backups and a rollback plan;
4. execute during an approved maintenance window;
5. run post-retirement verification.

These are engineering/release activities, not field terminal procedures. See the [storage retirement runbook](runbooks/storage-retirement.md).

## VPOS proxy settings

`/admin/proxy-settings` reads and updates the live vpos-proxy configuration through `GET` and `PATCH /proxy/settings`. It exposes the cloud, internal, and Tanzania Swagger endpoint settings, including `swaggerEndpointTanzania` (`VPOS_SWAGGER_ENDPOINT_TANZANIA` on vpos-proxy). Endpoint resolution uses an explicitly persisted proxy URL first, then the configured DOMS/JPL host on port `5555`, and finally the deployment/runtime default.

`vpos-ftc-app` does not connect to Azure SQL or any other cloud database. The retired `AZURE_SQL_*`, `VPOS_FISCALIZATION_SYNC_MODE`, and `VPOS_FISCALIZATION_SYNC_CUTOVER_ACK` settings are not supported. Cloud delivery, retry, offline queueing, and country-specific endpoint routing are owned by `vpos-proxy`. The old station push/pull sync actions and cloud-customer import are retired; customer records remain station-owned PostgreSQL data.

## Tanzania cumulative gross total

`station_settings.tanzania_gross_total_opening` is the typed opening balance for the lifetime Tanzania `grossTotal`. Administrators maintain it on `/admin/tanzania-fiscal`. Daily-total compilation adds fiscal turnover recorded by the current installation through the report business date.

The numeric default is `0.00`, but an administrator must explicitly capture that value to confirm a new station baseline. A replacement machine at an existing station uses the last accepted `grossTotal` from the retired machine before local transaction accumulation begins. The capture timestamp is stored in `station_settings.tanzania_gross_total_opening_captured_at`.

## Tanzania device ID override

`station_settings.tanzania_device_id_override` remains an optional administrator-owned value maintained on `/admin/tanzania-fiscal` for compatibility. FTC no longer sends this value as `deviceId` or `x-device-id` in Tanzania invoice, daily-total, or tank inventory submissions; effective device identity and EWURA licence values are resolved by the cloud service.

## Tanzania daily totals schedule

`station_settings.tanzania_daily_totals_send_time` is the administrator-owned station-local wall-clock time for automatic Tanzania daily-total submission. It uses `HH:mm` semantics and defaults to `00:00`.

The runtime worker may poll more frequently, but it creates the previous closed business-day report only after this local time is reached. Administrators maintain the value from `/tanzania/daily-totals`; the worker rereads it while running, so a process restart is not required.

## PostgreSQL pool

The FTC PostgreSQL pool is process-global so separate compiled server module graphs cannot multiply the connection limit within one Node.js process. Runtime defaults remain 20 connections, a 30 second idle timeout, and a 10 second connection-acquisition timeout.

Pool tuning is an engineering/deployment concern, not a field-support action. Field technicians should diagnose symptoms through VPOS and escalate runtime-capacity issues rather than attempting to alter process environment values on the DOMS.

## Forecourt runtime backpressure

The DOMS/JPL runtime reserves database capacity for foreground UI/API work rather than allowing polling and worker timers to acquire the entire PostgreSQL pool. The runtime includes bounded defaults for fallback polling, stale-buffer detection, request pacing, persistence/event concurrency, request concurrency, materialization concurrency, and runtime diagnostics.

These values are implementation/runtime controls. Where an operationally safe setting is intended for field adjustment, it should be exposed through an approved VPOS configuration screen. Values that are not exposed through the application must not be changed by field staff through shell or `.env` access.

## ATG polling

ATG polling is owned by typed `station_settings` columns rather than `station_kv`. `atg_polling_enabled` defaults to `false`, and `atg_polling_interval_seconds` defaults to 600 seconds (10 minutes).

Administrators and managers configure these values from `/settings/tanks`. The runtime worker refreshes the settings while running, so changing the enabled state or interval does not require a process restart. Each successful `GET_ALL_TG_DATA` poll replaces the station's local `tank_atg_snapshots` row for each configured tank; local ATG history is not retained because long-term history is stored by the cloud service.
