# VPOS FTC API wire contracts: settings, setup, and administration

**Baseline:** `vpos-ftc-app` `3058ac6bc63073556dfd3d41d7869ab181773d6c`.  
**Common envelopes:** see [COMMON_AND_AUTH.md](./COMMON_AND_AUTH.md).

## 1. `/api/settings` is console settings, not station settings

The current `/api/settings` route stores/returns the console settings JSON object. It does **not** apply the validated station-fiscal settings contract described under `/api/admin/settings`.

### `GET /api/settings`

**Access:** tenant, manager, administrator.

Direct JSON response:

```ts
type ConsoleSettings = Record<string, unknown>
```

The route returns the stored object directly, not inside `SuccessEnvelope<T>`. If there is no stored value, it returns `{}`.

### `POST /api/settings`

**Access:** manager, administrator.

Request can be either:

```ts
type ConsoleSettingsRequest = Record<string, unknown>
```

or wrapped as:

```ts
interface ConsoleSettingsWrapper {
  settings: Record<string, unknown>
}
```

Direct response:

```json
{
  "success": true
}
```

## 2. Validated station settings: `/api/admin/settings`

### Request

```ts
interface StationSettingsUpdate {
  linkingWindowSeconds?: number | string // integer 0..3600
  unallocatedHandling?: "anonymous" | "placeholder"
  fiscalizationEngine?: "TZ" | "KE" | "mock"
  fiscalizationTransport?: "proxy" | "local_tz"
  autoFiscalizeEnabled?: boolean | string
  autoPrintReceipts?: boolean | string
  printReceiptOrder?: "before_fiscalization" | "after_fiscalization"
  tinCaptureOrder?: "before_transaction" | "after_transaction"
  syncEnabled?: boolean | string
  syncTime?: string       // HH:MM:SS
  syncTimezone?: string   // max 50
  moneyDecimals?: number | string     // integer 0..3
  unitPriceDecimals?: number | string // integer 0..3
  volumeDecimals?: number | string    // integer 0..3
}
```

The shared station-settings schema also defines proxy/VAT properties used by other configuration paths:

```ts
interface ExtendedStationSettingsFields {
  proxyUrl?: string
  proxyBasePath?: string
  vatRateTz?: number
  vatRateKe?: number
  vatRateDefault?: number
}
```

VAT fractions are constrained to `0..1`; `proxyBasePath` must begin with `/` and contain only the accepted URL-path characters.

### Response

`GET` and successful `POST` return the station_settings database row through `SuccessEnvelope<T>`. This is a raw snake_case record. Important fields include:

```ts
interface StationSettingsRow {
  station_id: string
  linking_window_seconds: number
  unallocated_handling: string
  fiscalization_engine: string
  fiscalization_transport: string
  auto_fiscalize_enabled: boolean
  auto_print_receipts: boolean
  print_receipt_order: string
  tin_capture_order: string
  sync_enabled: boolean
  sync_time: string | null
  sync_timezone: string | null
  money_decimals: number
  unit_price_decimals: number
  volume_decimals: number
  proxy_url?: string | null
  proxy_base_path?: string | null
  vat_rate_tz?: number | string | null
  vat_rate_ke?: number | string | null
  vat_rate_default?: number | string | null
  tanzania_receipt_verification_prefix_mode?: string | null
  created_at?: string
  updated_at?: string
  [additionalMigratedColumn: string]: unknown
}
```

Because this route deliberately returns `SELECT *`, a forward-compatible client should ignore additional station-settings columns introduced by later package migrations.

## 3. Pump settings

### PumpSetting

```ts
interface PumpSetting {
  id: string
  code: string
  name: string
  status: string
  hasNozzleSelector: boolean
  pumpNumber: number
  tankGroupId: string
  tankGroupName: string
}

interface TankGroupOption {
  id: string
  code: string
  name: string
}

interface PumpSettingsData {
  pumps: PumpSetting[]
  tankGroups: TankGroupOption[]
}
```

### `GET /api/settings/pumps`

**Access:** manager, administrator.

```ts
type PumpSettingsResponse = SuccessEnvelope<PumpSettingsData>
```

### `POST /api/settings/pumps`

Creates a pump.

Body can be direct or wrapped under `data`:

```ts
interface PumpSettingsInput {
  id?: string // used on update, ignored on create
  code: string
  name: string
  status?: "ACTIVE" | "INACTIVE" | string // default ACTIVE
  pumpNumber: number | string
  hasNozzleSelector?: boolean | string | number
  tankGroupId?: string
  tankGroupName?: string
}
```

Rules:

- `code` and `name` are required;
- `pumpNumber` must parse to an integer greater than zero;
- status must normalize to `ACTIVE` or `INACTIVE`;
- code and pump number must be unique per station;
- tank group can be selected/created through `tankGroupId` or `tankGroupName` according to the application service.

Success:

```ts
type SavePumpResponse = SuccessEnvelope<{ id: string }>
```

### `PUT /api/settings/pumps`

Same input as create, but `id` is required. Success is `SuccessEnvelope<{id:string}>`.

## 4. Tank settings

### TankSetting

```ts
interface TankSetting {
  id: string
  code: string
  name: string
  status: string
  productId: string
  productExternalId: string
  productName: string
  productCode: string
  capacityLitres: number
  lowLevelLitres: number | null
  criticalLevelLitres: number | null
  tankGroupId: string
  tankGroupName: string
  domsTankId: string
  liveVolumeLitres: number | null
  liveTcVolumeLitres: number | null
  liveTemperatureC: number | null
  liveVolumeUpdatedAt: string | null
  manualVolumeLitres: number | null
  manualVolumeRecordedAt: string | null
  manualVolumeRecordedBy: string
  atgProductLevelMm: number | null
  atgWaterLevelMm: number | null
  atgWaterVolumeLitres: number | null
  atgAvailableRoomLitres: number | null
  atgGaugeOnline: boolean | null
  atgInventoryDataReady: boolean | null
  atgGaugeAlarmActive: boolean | null
  atgGaugeErrorActive: boolean | null
  atgControllerUpdatedAt: string | null
  atgCapturedAt: string | null
}

interface TankProductOption {
  id: string
  name: string
  code: string
}

interface AtgPollingSettings {
  enabled: boolean
  intervalMinutes: number
}

interface TankSettingsData {
  tanks: TankSetting[]
  products: TankProductOption[]
  tankGroups: TankGroupOption[]
  atgPolling: AtgPollingSettings
}
```

### `GET /api/settings/tanks`

**Access:** manager, administrator.

```ts
type TankSettingsResponse = SuccessEnvelope<TankSettingsData>
```

### Create/update tank

`POST /api/settings/tanks` creates; `PUT /api/settings/tanks` updates. Body can be direct or under `data`:

```ts
interface TankSettingsInput {
  id?: string // required for PUT
  code: string
  name: string
  productId: string
  status?: "ACTIVE" | "INACTIVE" | string
  capacityLitres: number | string
  lowLevelLitres?: number | string | null
  criticalLevelLitres?: number | string | null
  domsTankId?: string
  manualVolumeLitres?: number | string | null
  tankGroupId?: string
  tankGroupName?: string
}
```

Rules:

- capacity must be greater than zero;
- low/critical thresholds cannot exceed capacity;
- product must exist at the station;
- code must be station-unique;
- changing a tank's product is rejected while nozzles reference that tank.

Success:

```ts
type SaveTankResponse = SuccessEnvelope<{ id: string }>
```

### `DELETE /api/settings/tanks`

Accepted shapes:

```json
{ "id": "tank-uuid" }
```

or:

```json
{ "data": { "id": "tank-uuid" } }
```

Success: `SuccessEnvelope<{id:string}>`.

Deletion is rejected if a nozzle references the tank. PostgreSQL FK code `23503` is translated to the same client-facing validation failure.

## 5. ATG polling

### `PUT /api/settings/tanks/atg-polling`

```ts
interface AtgPollingUpdate {
  enabled?: boolean
  intervalMinutes?: number | string
}
```

`intervalMinutes` must resolve to an integer from `1` through `1440` (24 hours). Missing/invalid numeric input normalizes to the default `10` before range validation. The route's boolean behavior treats only literal `true` as enabled at the application-service layer.

Success is `SuccessEnvelope<AtgPollingSettings>`.

## 6. Pump operating mode

### `GET /api/settings/pump-mode`

**Access:** administrator.

The response identifies available pump numbers and the subset configured to skip attendant authorization.

```ts
interface PumpModeResponseData {
  availablePumps: number[]
  selectedPumps: number[]
}
```

### `POST /api/settings/pump-mode`

Body may be direct or under `data`:

```ts
interface PumpModeUpdate {
  selectedPumps?: Array<number | string>
  skipAttendantAuthFpIds?: Array<number | string> // alias
}
```

Every selected pump must exist at the station. Success is `SuccessEnvelope<PumpModeResponseData>`.

## 7. Forecourt runtime settings

### `GET /api/admin/setup/forecourt-settings`

**Access:** manager, administrator.

Direct response:

```ts
interface ForecourtRuntimeConfig {
  mode: "jpl_tcp"
  jplOperationMode: "unsupervised" | "supervised" | string
  jplHost: string
  jplPort: number
  jplPosId: string
  jplAccessCode: string
  jplCountryCode: string
  jplPosVersionId: string
  jplUnsolicitedDrSeconds: number
  jplHeartbeatIntervalMs: number
  jplDeadConnectionTimeoutMs: number
  jplExpectedMinVersion: string
  jplUnsolicitedFlags: string[]
  jplUnsolicitedMfdrFlags: string[]
  jplStatusUpdateCode: number
  jplBootstrapSnapshotEnabled: boolean
  bufferWarnDepthSup: number
  bufferCritDepthSup: number
  bufferWarnAgeMinSup: number
  bufferCritAgeMinSup: number
  bufferWarnDepthUnsup: number
  bufferCritDepthUnsup: number
  bufferWarnAgeMinUnsup: number
  bufferCritAgeMinUnsup: number
}

interface ForecourtSettingsResponse {
  success: true
  data: ForecourtRuntimeConfig
}
```

### `POST /api/admin/setup/forecourt-settings`

**Access:** administrator.  
**CSRF:** explicitly disabled by the route.

All fields are optional; omitted values preserve the current setting:

```ts
interface SaveForecourtSettingsRequest {
  mode?: string
  jplOperationMode?: "unsupervised" | "supervised" | string
  jplHost?: string
  jplPort?: number
  jplPosId?: string
  jplAccessCode?: string
  jplCountryCode?: string
  jplPosVersionId?: string
  jplUnsolicitedDrSeconds?: number
  jplHeartbeatIntervalMs?: number
  jplDeadConnectionTimeoutMs?: number
  jplExpectedMinVersion?: string
  jplUnsolicitedFlags?: string[] | string
  jplUnsolicitedMfdrFlags?: string[] | string
  jplStatusUpdateCode?: number
  jplBootstrapSnapshotEnabled?: boolean
  bufferWarnDepthSup?: number
  bufferCritDepthSup?: number
  bufferWarnAgeMinSup?: number
  bufferCritAgeMinSup?: number
  bufferWarnDepthUnsup?: number
  bufferCritDepthUnsup?: number
  bufferWarnAgeMinUnsup?: number
  bufferCritAgeMinUnsup?: number
}
```

The saved result is the effective `ForecourtRuntimeConfig`.

## 8. User administration

### `/api/users` GET

**Access:** manager, administrator.

The route intentionally double-nests its console compatibility payload:

```ts
interface UsersListResponse {
  ok: true
  success: true
  data: {
    data: UserAdminRow[]
  }
}
```

`UserAdminRow` is the station user record returned by the server user service and never contains password hashes/session tokens.

### `/api/users` POST

```ts
interface CreateUserRequest {
  username: string
  email: string
  password: string
  role: "administrator" | "manager" | "tenant" | "field_engineer"
  fullName?: string
  csrf_token?: string
}
```

All of `username`, `email`, `password`, and `role` must be non-empty at the route. Success is also console-compatible/double-nested:

```ts
interface CreateUserResponse {
  ok: true
  success: true
  data: {
    data: Record<string, unknown>
  }
}
```

### `/api/users` PATCH

```ts
interface PatchUserRequest {
  userId?: string
  id?: string // alias of userId
  setActive?: boolean | string | number
  isActive?: boolean | string | number
  active?: boolean | string | number
  newPassword?: string
  password?: string
  role?: string
  fullName?: string
  email?: string
  username?: string
  csrf_token?: string
}
```

`userId || id` is required and must identify a user at the authenticated station.

Success:

```json
{
  "ok": true,
  "success": true,
  "data": {
    "success": true
  }
}
```

### `/api/users/{id}` GET

This route does **not** use the common success envelope:

```ts
interface GetUserByIdResponse {
  data: UserAdminRow
}
```

Failures are direct:

```json
{ "success": false, "error": "User not found" }
```

### `/api/users/{id}` DELETE

Soft-deletes the user and invalidates their sessions. Direct success:

```json
{ "success": true }
```

## 9. Initial setup/admin

### `POST /api/setup/admin`

```ts
interface InitialAdminRequest {
  username: string
  password: string
  email?: string
  fullName?: string
  deviceRegistered?: boolean | "true" | string
  csrf_token?: string
}
```

Device registration must be asserted by body `deviceRegistered === true | "true"` or `x-device-registered: true`.

Route validation requires username length at least 3 and password length at least 6. If email is omitted, `${username}@local` is used.

Direct success:

```ts
interface InitialAdminSuccess {
  success: true
  message: "Admin user created successfully"
  userId: string
  username: string
}
```

A pre-existing user returns HTTP `409` with `{success:false,error:"User already exists"}`.

## 10. Setup device registration

### `POST /api/setup/device`

```ts
interface SetupDeviceRequest {
  action?: "register" | "reset"
  registrationCode?: string
  RegistrationCode?: string
  countryCode?: string
  countryId?: string
  csrf_token?: string
}
```

Reset success:

```json
{
  "ok": true,
  "success": true,
  "data": {
    "reset": true
  }
}
```

Register success is `SuccessEnvelope<Record<string, unknown>>`; the nested object is the registration result received/normalized by the proxy registration service. That nested schema belongs to the proxy registration protocol.

## 11. Setup site action

### `POST /api/setup/site`

```ts
type SetupSiteRequest =
  | {
      action: "set-country"
      country: string
      csrf_token?: string
    }
  | {
      action?: "sync"
      csrf_token?: string
    }
```

`set-country` requires a non-empty `country`. `sync` invokes the setup site-profile synchronization service. Success uses the common `SuccessEnvelope<T>` around the operation result.

## 12. Setup status

### `GET /api/setup/status`

Direct response, not the common envelope:

```ts
interface SetupStatusResponse {
  success: true
  stationId: string
  flags: Record<string, unknown>
  status: unknown
}
```

`flags` is the durable setup-flag object. `status` is the setup status payload returned by the setup status service; it can evolve with setup steps, so clients should use the flags/fields they have explicitly agreed to consume and ignore unknown additions.

## 13. Setup forecourt count

### `GET /api/setup/forecourt`

**Access:** manager, administrator.  
**Important correction:** this route is GET-only at the documented baseline; it does not save a forecourt mapping.

Success is `SuccessEnvelope<SetupForecourtCounts>` from the setup count service.

## 14. Setup proxy status

### `GET /api/setup/proxy-status`

Public setup-context route.

```ts
type SetupProxyStatusData = Record<string, unknown>
type SetupProxyStatusResponse = SuccessEnvelope<SetupProxyStatusData>
```

The nested object is the registration-status object returned by `vpos-proxy`; VPOS only requires it to be a plain JSON object at this boundary.

## 15. Branding

### Branding update request

`POST /api/admin/branding` accepts normal form/JSON fields and an optional uploaded `logo` file:

```ts
interface BrandingUpdate {
  primaryColor?: string       // #RRGGBB
  secondaryColor?: string     // #RRGGBB
  stationDisplayName?: string // max 255
  receiptFooterText?: string  // max 1000
  receiptHeaderText?: string  // max 1000
  logoPath?: string
  logo?: File
}
```

Accepted uploaded logo types are PNG, JPEG/JPG, and SVG, maximum 2 MiB.

GET/POST success uses `SuccessEnvelope<BrandingSettingsRow | null>`. The stored row is database-shaped (snake_case), including fields such as:

```ts
interface BrandingSettingsRow {
  id: string
  station_id: string
  logo_path: string | null
  primary_color: string | null
  secondary_color: string | null
  station_display_name: string | null
  receipt_footer_text: string | null
  receipt_header_text: string | null
  updated_at: string
  [additionalColumn: string]: unknown
}
```

## 16. Administrator config objects

These endpoints are configuration-record APIs. Where `configJson` is shown, the HTTP layer deliberately permits arbitrary JSON because the selected device/plugin owns the nested config schema.

### Device config request

```ts
interface DeviceConfigRequest {
  deviceType?: unknown
  deviceKey?: unknown
  enabled?: unknown
  configJson?: unknown
  config_json?: unknown // alias
  schemaVersion?: unknown
}
```

Used by `/api/admin/config/devices` POST.

### Plugin config request

```ts
interface PluginConfigRequest {
  processType?: unknown
  pluginName?: unknown
  enabled?: unknown
  configJson?: unknown
  config_json?: unknown // alias
  schemaVersion?: unknown
}
```

Used by `/api/admin/config/plugins` write paths where present.

### Station config request

```ts
interface StationConfigRequest {
  config_json?: unknown
}
```

Used by `/api/admin/config/station` POST. The nested station config object is intentionally unconstrained at this HTTP boundary.

## 17. Console/configuration compatibility principle

An endpoint documented here as `Record<string, unknown>` is not missing documentation: that is the exact runtime type accepted/emitted by the current HTTP layer. Such a field must be governed by the named downstream component's contract if a third party needs to interpret its internals.
