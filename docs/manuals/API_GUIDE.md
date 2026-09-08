# VPOS FTC API Guide and Endpoint Reference

**Audience:** Approved third-party developers, integrators, monitoring teams, support engineers, and solution architects  
**Purpose:** Describe the complete HTTP API route surface implemented by `vpos-ftc-app`, including each route's aim, request shape, response family, access boundary, and important side effects.  
**Documentation baseline:** reviewed against `vpos-ftc-app` `main` commit `bbd11ab2ee9d364fd96771c7f4119d0199a03923` on 2026-09-08  
**Route inventory source:** every `app/api/**/route.ts` file present at that baseline.

## 1. Read this before integrating

The application exposes a large `/api` surface, but the presence of a route does **not** mean it is a supported public integration contract.

The current API surface contains four different classes of interface:

1. **Operational public endpoints** — local liveness, readiness, health, and Prometheus metrics.
2. **Interactive application APIs** — session-protected routes used by the VPOS web application.
3. **Administrative/commissioning APIs** — privileged station setup, diagnostics, maintenance, fiscal, and recovery controls.
4. **Internal compatibility/adapter APIs** — DOMS/JPL, supervisor, terminal, legacy VPOS, and proxy-facing adapters whose schemas may follow internal or legacy contracts.

Unless an integration agreement explicitly says otherwise, treat everything except the operational public endpoints as an **internal application API**. Do not build an unattended third-party production integration by scraping browser calls or assuming that an internal route will retain its current URL, payload, authorization, or side-effect semantics.

A current internal `GET` is also not guaranteed to be side-effect free. In particular, receipt preview can create durable pre-fiscalization receipt state when the station is configured to print before fiscalization.

## 2. Base URL

Examples use:

```text
<VPOS_BASE_URL>
```

For example:

```text
https://station-vpos.example.local
```

Hostname, port, TLS termination, and network exposure are deployment-specific. Keep station APIs on approved station/management networks and do not expose the full application to the public Internet merely to consume one route.

## 3. Authentication, roles, and CSRF

### 3.1 Session authentication

Most application routes require the VPOS session cookie created by `/api/auth/login`.

The application roles are:

- `tenant`
- `manager`
- `administrator`

Individual routes may allow one, two, or all three roles.

There is currently no repository-wide external contract for:

- Bearer service tokens
- static partner API keys
- OAuth client credentials
- per-client API scopes
- a versioned `/api/v1` integration namespace

### 3.2 CSRF

Protected mutation helpers normally validate CSRF. The server accepts the token from:

```text
x-csrf-token
x-xsrf-token
```

or request-body fields:

```text
csrfToken
csrf_token
_csrf
```

Some compatibility adapters explicitly disable CSRF, notably the `/api/pos/doms/*` command family. That is an implementation detail, not permission to expose those endpoints externally.

### 3.3 Common role notation used below

| Notation | Meaning |
| --- | --- |
| `Public` | no VPOS user session required by the route |
| `T/M/A` | tenant, manager, or administrator |
| `M/A` | manager or administrator |
| `A` | administrator only |
| `Setup` | bootstrap/setup context; authorization depends on whether station setup is complete |
| `Internal` | compatibility/runtime route; inspect deployment policy before use |

## 4. Response conventions

### 4.1 Normal JSON success

Many routes use the common success envelope:

```json
{
  "ok": true,
  "success": true,
  "data": {}
}
```

In the catalog, `OK<T>` means the route normally returns the above envelope with a domain-specific value `T` in `data`.

### 4.2 Normal JSON failure

The shared failure/error family is generally:

```json
{
  "ok": false,
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable message",
    "details": null,
    "requestId": "correlation-id"
  }
}
```

Not every route populates every field. Some older/compatibility handlers return a smaller error object or a direct `NextResponse.json` payload.

For a `500`, preserve `requestId`. The client may intentionally receive only `Internal server error` while the station log retains the underlying PostgreSQL, filesystem, DOMS, fiscal, or proxy exception.

### 4.3 Non-JSON responses

Some endpoints deliberately return other representations:

- `/api/metrics` — Prometheus text
- report/fiscal exports — CSV, NDJSON, JSON export payloads, or downloadable content
- asset endpoints — file/image response
- HTML-form-aware authentication/setup routes — may return `303` redirects

### 4.4 Catalog request notation

| Notation | Meaning |
| --- | --- |
| `Q{...}` | URL query-string parameters |
| `P{...}` | path parameters |
| `B{...}` | JSON/form request body |
| `B<domain>` | route accepts a domain-specific object delegated to a service/helper; fields are not a stable external schema |
| `—` | no request payload beyond authentication/context |
| `OK<T>` | normal common success envelope containing `T` |
| `Direct<T>` | route returns a direct response rather than the standard envelope |

When the HTTP route accepts `Record<string, unknown>` and delegates interpretation to a domain helper, this guide intentionally says `B<domain>` rather than inventing a stricter public schema that the route does not define.

## 5. Public operational endpoints

These are the clearest current candidates for approved local monitoring use.

### 5.1 `GET /api/livez`

**Aim:** prove only that the HTTP process has started and can answer requests.

**Request:** none.

**Response:**

```json
{
  "ok": true,
  "success": true,
  "status": "running"
}
```

A successful liveness response does not prove PostgreSQL, workers, DOMS/JPL, printing, or fiscal/proxy health.

### 5.2 `GET /api/readyz`

**Aim:** report deeper application readiness for normal station operation.

**Request:** none.

**Expected response family:**

```json
{
  "ok": true,
  "success": true,
  "data": {
    "...readiness fields...": "..."
  }
}
```

Nested readiness fields are operational data and should not be treated as frozen third-party schema unless separately contracted.

### 5.3 `GET /api/healthz`

**Aim:** return the current station runtime health model.

**Request:** none.

**Expected response family:**

```json
{
  "ok": true,
  "success": true,
  "data": {
    "health": {
      "...domain health fields...": "..."
    }
  }
}
```

### 5.4 `GET /api/metrics`

**Aim:** expose the in-process Prometheus metrics snapshot.

**Request:** none.

**Response content type:**

```text
text/plain; version=0.0.4; charset=utf-8
```

**Response body:** Prometheus exposition text, not JSON.

## 6. Authentication and security endpoints

### `POST /api/auth/login`

**Aim:** authenticate a human VPOS user and create the session cookie used by protected application routes.

**Request:**

```json
{
  "username": "operator-name",
  "password": "user-password"
}
```

Both fields are required. Do not log the password.

**JSON success:**

```json
{
  "ok": true,
  "success": true,
  "data": {
    "expiresAt": "2026-09-08T12:34:56.000Z"
  }
}
```

Typical failures are `400` for missing fields and `401` for invalid credentials. HTML form requests may receive a `303` redirect instead of JSON.

### `POST /api/auth/logout`

**Aim:** invalidate/clear the current application session.

**Request:** current session; no business payload expected.

**Expected response:** success acknowledgement or HTML redirect according to request mode.

### `GET /api/auth/session`

**Aim:** return the current authenticated-session/user context to the UI.

**Request:** current session cookie.

**Expected response:** current session/user representation or unauthenticated response.

### `GET /api/security/csrf`

**Aim:** provide the CSRF token/state used by protected browser mutations.

**Request:** authenticated browser/session context where required.

**Expected response:** CSRF token payload. Treat the token as sensitive transient state.

## 7. Complete endpoint catalog

The tables below enumerate **every API route file present under `app/api` at the documentation baseline**. For compactness, repeated internal families use a shared request/response contract described after the catalog.

### 7.1 Admin: archive, configuration, diagnostics, datasets, logs, printing, and integration settings

| Endpoint | Aim | Access | Request | Expected response |
| --- | --- | --- | --- | --- |
| `/api/admin/archive/destinations` | List/configure supported archival destinations. | M/A | read or `B<archive destination>` | `OK<archive destinations>` |
| `/api/admin/archive/exports` | Inspect archive/export state; legacy POST creation is deprecated. | M/A | GET `—`; deprecated POST | `OK<exports>`; deprecated mutation can return `410` |
| `/api/admin/branding` | Read/update station UI/receipt branding configuration. | A | read or `B<branding>` | `OK<branding>` |
| `/api/admin/config/defaults` | Return application/runtime configuration defaults. | A | `—` | `OK<config defaults>` |
| `/api/admin/config/devices` | Return effective device-related configuration. | A | `—` | `OK<device config>` |
| `/api/admin/config/effective` | Return resolved/effective configuration after overrides. | A | `—` | `OK<effective config>` |
| `/api/admin/config/plugins` | Enumerate configured/available plugin configuration. | A | `—` | `OK<plugin config>` |
| `/api/admin/config/retention` | Read/update retention configuration. | A | read or `B<retention>` | `OK<retention settings>` |
| `/api/admin/config/retention/run` | Execute the bounded retention/cleanup coordinator. | A | action body optional/domain-specific | `OK<retention run result>` |
| `/api/admin/config/station` | Read/update durable station configuration. | A | read or `B<station config>` | `OK<station config>` |
| `/api/admin/config/status` | Report configuration subsystem status. | A | `—` | `OK<config status>` |
| `/api/admin/datasets` | Manage country/configuration datasets. | A | read or `B<dataset operation>` | `OK<dataset result>` |
| `/api/admin/device/registration` | Read/perform device registration administration. | A | read or `B<device registration>` | `OK<registration result>` |
| `/api/admin/diagnostics` | Return privileged diagnostic information. | A | optional query filters | `OK<diagnostics>` |
| `/api/admin/diagnostics/overview` | Return a consolidated diagnostic overview. | A | `—` | `OK<diagnostic overview>` |
| `/api/admin/env` | Read/set/delete permitted station environment overrides. | M/A | `B{name,value}` for writes; DELETE `B{name}` | `OK<environment result>` |
| `/api/admin/integrations/pos` | Report/configure POS integration state. | A | read or `B<POS integration>` | `OK<POS integration>` |
| `/api/admin/integrations/pss-xml` | Inspect/import/export PSS XML integration state. | A | read or `B/PSS XML input` | `OK<PSS XML result>` or file content |
| `/api/admin/languages` | Read/manage installed language resources. | A | read or `B<language operation>` | `OK<languages>` |
| `/api/admin/legacy-import/ledger` | Inspect legacy import ledger/history. | A | query filters | `OK<legacy import ledger>` |
| `/api/admin/legacy-import/retry` | Retry eligible failed legacy imports. | A | `B<retry selection>` | `OK<retry result>` |
| `/api/admin/legacy-import/status` | Report legacy import status. | A | `—` | `OK<import status>` |
| `/api/admin/logs` | Compatibility endpoint for privileged application logs. | A | query/body depends on log action | `OK<log result>` |
| `/api/admin/logs/archive` | Archive/rotate eligible logs. | A | action payload optional | `OK<archive result>` |
| `/api/admin/logs/clear` | Clear eligible application logs. | A | `B<clear selection>` | `OK<clear result>` |
| `/api/admin/logs/content` | Read selected log content. | A | `Q{type,filename,lines}` | `OK/text<log content>` |
| `/api/admin/logs/list` | List available live/archive/restart logs. | A | `Q{type?}` | `OK<log files>` |
| `/api/admin/logs/view` | View a selected log representation. | A | query identifying log | `OK/text<log>` |
| `/api/admin/print-jobs` | Inspect administrative print queue/history. | A | query filters | `OK<print jobs>` |
| `/api/admin/print-jobs/process` | Process the next eligible print job immediately. | A | action, normally no business body | `OK<processed job/result>` |
| `/api/admin/products/page-data` | Load consolidated product administration page data. | A | optional query | `OK<product page data>` |
| `/api/admin/proxy-settings` | Read/update settings held through the proxy settings application service. | A | PATCH `B<proxy settings>` | `OK<proxy settings/result>` |
| `/api/admin/reports` | Provide privileged report administration data. | A | query/report parameters | `OK<report admin data>` |
| `/api/admin/secure-artifacts` | List/create/delete approved secure artifact references/files. | A | write `B<secure artifact>`; delete identifies artifact | `OK<artifact result>` |
| `/api/admin/settings` | Read/update consolidated administrator settings. | A | read or `B<admin settings>` | `OK<settings>` |
| `/api/admin/status` | Return administrator-level station/runtime status. | A | `—` | `OK<admin status>` |
| `/api/admin/sync/run` | Trigger an administrator sync cycle. | A | optional `B<sync options>` | `OK<sync run>` |
| `/api/admin/sync/status` | Inspect administrator sync state. | A | `—` | `OK<sync status>` |
| `/api/admin/users` | Administrator user-management API. | A | read or `B<user create/update>` | `OK<user/users>` |

### 7.2 Admin: EWURA and Tanzania fiscal administration

| Endpoint | Aim | Access | Request | Expected response |
| --- | --- | --- | --- | --- |
| `/api/admin/ewura/[type]` | List/create EWURA records of the selected supported type. | A | `P{type}` + query or `B<EWURA record>` | `OK<EWURA result>` |
| `/api/admin/ewura/[type]/[id]` | Read/update/delete one EWURA record. | A | `P{type,id}` + domain body where mutating | `OK<EWURA record/result>` |
| `/api/admin/tanzania-fiscal` | Read/update Tanzania fiscal administration configuration/status. | A | read or `B<Tanzania fiscal config>` | `OK<Tanzania fiscal state>` |
| `/api/admin/tanzania-fiscal/ewura-register` | Execute EWURA registration workflow. | A, Tanzania | `B<EWURA registration>` | `OK<registration result>` |
| `/api/admin/tanzania-fiscal/gross-total-opening` | Read/update opening gross totals/counter baselines. | A, Tanzania | PATCH `B<opening totals/counters>` | `OK<gross-total opening state>` |
| `/api/admin/tanzania-fiscal/proxy-registration` | Read/save Tanzania proxy registration state. | A, Tanzania | `B<proxy registration>` | `OK<registration state>` |
| `/api/admin/tanzania-fiscal/tra-register` | Execute TRA registration workflow. | A, Tanzania | `B<TRA registration>` | `OK<TRA registration result>` |

### 7.3 Admin: forecourt commissioning, diagnostics, validation, maintenance, and recovery

All routes in this subsection are privileged engineering/operations interfaces. They can affect live forecourt state and must not be exposed as general partner APIs.

| Endpoint | Aim | Request | Expected response |
| --- | --- | --- | --- |
| `/api/admin/forecourt-sync/run` | Trigger forecourt synchronization. | `B<sync options>` | `OK<sync result>` |
| `/api/admin/forecourt-sync/status` | Read forecourt synchronization status. | `—` | `OK<sync status>` |
| `/api/admin/forecourt/commissioning` | Read/update commissioning state. | `B<commissioning state>` when mutating | `OK<commissioning>` |
| `/api/admin/forecourt/commissioning/checklist` | Retrieve/update commissioning checklist evidence. | optional `B<checklist>` | `OK<checklist>` |
| `/api/admin/forecourt/commissioning/test-connection` | Run approved forecourt/JPL connection test. | `B<connection test options>` | `OK<test result>` |
| `/api/admin/forecourt/diagnostics` | Return detailed forecourt diagnostics. | optional query | `OK<diagnostics>` |
| `/api/admin/forecourt/domain-snapshot` | Return a consolidated forecourt domain snapshot. | optional query | `OK<snapshot>` |
| `/api/admin/forecourt/events-live` | Return/stream recent live forecourt events. | query cursor/filter | `OK<events>` or stream-compatible response |
| `/api/admin/forecourt/events` | Query stored forecourt events. | query filters | `OK<events>` |
| `/api/admin/forecourt/field-validation` | Read/create field-validation state. | `B<validation input>` | `OK<validation>` |
| `/api/admin/forecourt/field-validation/acceptance-pack` | Produce acceptance-pack data. | selection/query | `OK<acceptance pack>` |
| `/api/admin/forecourt/field-validation/export` | Export field-validation evidence. | query/selection | downloadable/export response |
| `/api/admin/forecourt/field-validation/live-readonly` | Run live read-only validation against forecourt. | `B<validation options>` | `OK<live validation>` |
| `/api/admin/forecourt/field-validation/sign-off` | Record field-validation sign-off. | `B<sign-off>` | `OK<sign-off>` |
| `/api/admin/forecourt/maintenance/compare` | Compare proposed/current maintenance state. | `B<comparison input>` | `OK<comparison>` |
| `/api/admin/forecourt/maintenance/execute` | Execute an approved maintenance operation. | `B<approved execution>` | `OK<execution result>` |
| `/api/admin/forecourt/maintenance/execution-gate` | Evaluate whether maintenance execution is permitted. | `B<gate context>` | `OK<gate result>` |
| `/api/admin/forecourt/maintenance/execution-permit` | Create/validate execution permit state. | `B<permit>` | `OK<permit>` |
| `/api/admin/forecourt/maintenance/final-confirmation` | Record final human confirmation before sensitive execution. | `B<confirmation>` | `OK<confirmation>` |
| `/api/admin/forecourt/maintenance/plan` | Build/read a maintenance plan. | `B<plan input>` | `OK<plan>` |
| `/api/admin/forecourt/maintenance/preview` | Preview maintenance effects without applying them. | `B<maintenance request>` | `OK<preview>` |
| `/api/admin/forecourt/maintenance/sessions` | List/manage maintenance sessions. | query or `B<session>` | `OK<sessions/session>` |
| `/api/admin/forecourt/operational-readiness` | Evaluate production forecourt readiness. | optional query | `OK<readiness>` |
| `/api/admin/forecourt/prices` | Read/administer forecourt price information. | query or `B<price operation>` | `OK<prices/result>` |
| `/api/admin/forecourt/reconciliation` | Produce reconciliation view between VPOS and forecourt. | query/body context | `OK<reconciliation>` |
| `/api/admin/forecourt/reconciliation/apply` | Apply an approved reconciliation change. | `B<reconciliation decision>` | `OK<apply result>` |
| `/api/admin/forecourt/reconciliation/bulk` | Apply/prepare bulk reconciliation operations. | `B<bulk operations>` | `OK<bulk result>` |
| `/api/admin/forecourt/reconciliation/export` | Export reconciliation evidence. | query/selection | export response |
| `/api/admin/forecourt/reconciliation/history` | Read reconciliation history. | query filters | `OK<history>` |
| `/api/admin/forecourt/reconciliation/rollback` | Roll back an eligible reconciliation operation. | `B<rollback target>` | `OK<rollback result>` |
| `/api/admin/forecourt/state` | Return current forecourt application state. | `—`/query | `OK<forecourt state>` |
| `/api/admin/forecourt/support-bundle` | Build support bundle/evidence for escalation. | `B<bundle options>` | bundle/export result |
| `/api/admin/forecourt/tanks/dynamic-data` | Read/update dynamic tank/controller data. | query or `B<dynamic tank data>` | `OK<dynamic data>` |
| `/api/admin/forecourt/transactions` | Query forecourt transaction/recovery data. | query filters | `OK<forecourt transactions>` |
| `/api/admin/forecourt/transactions/recovery` | Execute/prepare transaction recovery workflow. | `B<recovery input>` | `OK<recovery result>` |
| `/api/admin/forecourt/transactions/replay/restore` | Restore/replay eligible forecourt transaction data. | `B<restore selection>` | `OK<restore result>` |
| `/api/admin/forecourt/workflows` | Read forecourt workflow state/capabilities. | query | `OK<workflows>` |

### 7.4 Admin: setup wizard and system control

| Endpoint | Aim | Access | Request | Expected response |
| --- | --- | --- | --- | --- |
| `/api/admin/setup/check-device-certificate` | Validate configured device certificate readiness. | A | setup context/body if required | `OK<certificate check>` |
| `/api/admin/setup/check-printer-page-width` | Validate printer/page-width configuration. | A | printer/config input | `OK<check>` |
| `/api/admin/setup/complete` | Mark/perform administrator setup completion. | A | `B<completion data>` | `OK<setup result>` |
| `/api/admin/setup/current` | Return current setup state. | A | `—` | `OK<setup state>` |
| `/api/admin/setup/device-configured` | Report/record whether the station device is configured. | A | optional body | `OK<device configured state>` |
| `/api/admin/setup/finalize` | Finalize station setup after validation. | A | `B<finalization acknowledgement>` | `OK<finalized setup>` |
| `/api/admin/setup/forecourt-settings` | Read/save setup-time forecourt/JPL settings. | A | `B<forecourt settings>` | `OK<settings>` |
| `/api/admin/setup/mark-step` | Mark a setup-wizard step complete/stateful. | A | `B{step,...}` | `OK<setup state>` |
| `/api/admin/setup/pumps-config` | Read/save setup pump/nozzle mapping. | A | `B<pump mapping>` | `OK<pump config>` |
| `/api/admin/setup/site-profile` | Read/save site profile. | A | `B<site profile>` | `OK<site profile>` |
| `/api/admin/setup/status` | Return administrator setup readiness/status. | A | `—` | `OK<setup status>` |
| `/api/admin/setup/test-jpl-settings` | Test supplied/current JPL forecourt settings. | A | `B<JPL settings>` | `OK<test result>` |
| `/api/admin/setup/test-printer-connection` | Test printer reachability. | A | `B<printer connection>` | `OK<test result>` |
| `/api/admin/setup/test-report-printout` | Generate/queue test report print. | A | `B<printer/test options>` | `OK<print result>` |
| `/api/admin/setup/test-tra-registration` | Test Tanzania TRA registration readiness. | A, Tanzania | `B<TRA test input>` | `OK<test result>` |
| `/api/admin/setup/test-transaction-printout` | Generate/queue test transaction receipt. | A | `B<printer/test options>` | `OK<print result>` |
| `/api/admin/setup/validate-payload` | Validate setup payload without finalizing. | A | `B<setup payload>` | `OK<validation>` |
| `/api/admin/setup/validate` | Validate current administrator setup state. | A | optional setup body | `OK<validation>` |
| `/api/admin/system/backups` | List/create/manage database/system backups. | A | read or `B<backup operation>` | `OK<backups/result>` |
| `/api/admin/system/backups/[filename]` | Retrieve/manage one named backup. | A | `P{filename}` | download or operation result |
| `/api/admin/system/reboot` | Legacy full-station reboot route; intentionally no longer supported. | A/Internal | action | direct `410`-style deprecation response |
| `/api/admin/system/reset-database` | Perform guarded database reset/reinitialization workflow. | A | explicit destructive confirmation body | `OK<reset result>` or guarded failure |
| `/api/admin/system/restart-service` | Restart the VPOS application/service using supported control path. | A | `B<restart options>` | `OK<restart accepted/result>` |

### 7.5 Bootstrap, branding assets, category assets, and static configuration dictionaries

| Endpoint | Aim | Access | Request | Expected response |
| --- | --- | --- | --- | --- |
| `/api/bootstrap/status` | Report bootstrap/startup state used before normal operation. | Internal/Public deployment-specific | `—` | status JSON |
| `/api/branding/[filename]` | Serve approved station branding file. | browser/internal | `P{filename}` | file/image response or `404` |
| `/api/category-assets/[filename]` | Serve product/category asset file. | browser/internal | `P{filename}` | file/image response or `404` |
| `/api/config/buyer-types` | Return configured buyer-type dictionary. | application | `—` | `OK<buyer types>` |
| `/api/config/credit-note-reasons` | Return configured credit-note reasons. | application | `—` | `OK<reasons>` |
| `/api/config/debug/summary` | Return debug/config summary. | privileged/internal | `—` | `OK<debug summary>` |
| `/api/config/pack-sizes` | Return pack-size dictionary. | application | `—` | `OK<pack sizes>` |
| `/api/config/pos-backends` | Return available POS backend values. | application | `—` | `OK<POS backends>` |
| `/api/config/pos-providers` | Return available POS provider values. | application | `—` | `OK<POS providers>` |
| `/api/config/product-class-codes` | Return product-class code dictionary. | application | `—` | `OK<class codes>` |
| `/api/config/product-type-codes` | Return product-type code dictionary. | application | `—` | `OK<type codes>` |
| `/api/config/pump-statuses` | Return pump status dictionary. | application | `—` | `OK<pump statuses>` |
| `/api/config/setup-countries` | Return countries supported by setup UI. | setup/application | `—` | `OK<countries>` |
| `/api/config/station-status` | Return station-status dictionary/current status support values. | application | `—` | `OK<station status values>` |
| `/api/config/tank-statuses` | Return tank status dictionary. | application | `—` | `OK<tank statuses>` |
| `/api/config/tax-types` | Return supported tax-type dictionary. | application | `—` | `OK<tax types>` |
| `/api/config/units-of-measure` | Return units-of-measure dictionary. | application | `—` | `OK<units>` |
| `/api/config/user-roles` | Return supported VPOS user roles. | application | `—` | `OK<roles>` |
| `/api/config/yes-no` | Return yes/no option dictionary. | application | `—` | `OK<options>` |

### 7.6 Generic control, terminal, DOMS, supervisor, and runtime-control adapters

These routes are internal compatibility/control surfaces. Payloads are intentionally described as domain command objects because the exact fields are command-dependent.

| Endpoint | Aim | Access | Request | Expected response |
| --- | --- | --- | --- | --- |
| `/api/control/[module]/[command]` | Dispatch a registered control command to a runtime module. | Internal/privileged | `P{module,command}` + `B<command>` | `OK/control-result` |
| `/api/control/events` | Query control-plane events. | Internal/privileged | query cursor/filter | `OK<events>` |
| `/api/control/registry` | Return registered control modules/commands. | Internal/privileged | `—` | `OK<registry>` |
| `/api/control/status` | Return control-plane status. | Internal/privileged | `—` | `OK<status>` |
| `/api/doms/[command]` | Generic legacy DOMS command adapter. | Internal | `P{command}` + command request | legacy DOMS success/failure |
| `/api/terminal/[command]` | Dispatch a terminal/runtime command. | Internal/privileged | `P{command}` + `B<command>` | command result |
| `/api/supervisor/process/[name]` | Inspect a named supervised process. | A/Internal | `P{name}` | process status |
| `/api/supervisor/process/[name]/[action]` | Perform a permitted action on one process. | A/Internal | `P{name,action}` + optional body | action result |
| `/api/supervisor/reload-config` | Reload supervisor/runtime configuration. | A/Internal | action | reload result |
| `/api/supervisor/restart` | Restart configured application process/service. | A/Internal | `B<restart target/options>` | restart result |
| `/api/supervisor/restart-all` | Restart all supported supervised VPOS processes. | A/Internal | guarded action | restart results |
| `/api/supervisor/status` | Return supervisor/process status. | A/Internal | `—` | status result |

### 7.7 Customers

| Endpoint | Aim | Access | Request | Expected response |
| --- | --- | --- | --- | --- |
| `/api/customers` | List/search customers and create a customer record. | T/M/A | GET `Q{q,country,buyerType,includeDeleted,page,pageSize}`; POST customer body | `OK<customer page>` / `OK<customer>` |
| `/api/customers/[id]` | Read/update/delete-or-restore one customer. | T/M/A | `P{id}` + PATCH customer fields; DELETE action body where used | `OK<customer/result>` |
| `/api/customers/import` | Import customer records in supported bulk format. | authorized application roles | import payload/file | `OK<import summary>` |
| `/api/customers/lookup` | Resolve a customer by supported exact identifiers. | T/M/A | query identifiers such as TIN/customer reference | `OK<customer/null>` |
| `/api/customers/search` | Search customers for POS/customer selection. | T/M/A | search query | `OK<customer matches>` |

#### Customer create payload

`POST /api/customers` currently validates these fields:

```json
{
  "tin": "123456789",
  "buyerName": "Example Customer",
  "buyerType": "...",
  "pin": "...",
  "passportNumber": "...",
  "businessName": "...",
  "taxNinbrn": "...",
  "addressStreet": "...",
  "addressCity": "...",
  "addressState": "...",
  "addressProvince": "...",
  "addressPostalCode": "...",
  "addressCountryCode": "TZ",
  "contactPhone": "...",
  "contactMobile": "...",
  "contactFax": "...",
  "contactEmail": "...",
  "contactWebsite": "...",
  "contactPerson": "...",
  "country": "TZ",
  "odometer": "...",
  "vehicleRegNr": "...",
  "paymentType": "..."
}
```

`tin` and `buyerName` are required after normalization. A normal JSON success contains the stored customer object in `data`.

### 7.8 Dashboard, forecourt status, pumps, tanks, and tank levels

| Endpoint | Aim | Access | Request | Expected response |
| --- | --- | --- | --- | --- |
| `/api/dashboard/summary` | Return consolidated dashboard KPIs/status. | authenticated UI | optional time/filter query | `OK<dashboard summary>` |
| `/api/forecourt/status` | Return current forecourt integration status. | authenticated UI/support | `—` | `OK<forecourt status>` |
| `/api/pumps/state` | Return current pump runtime state snapshot. | authenticated UI | optional query | `OK<pump states>` |
| `/api/tanks` | Return configured/live tank list. | authenticated UI | optional query | `OK<tanks>` |
| `/api/tank-levels` | Return tank-level/wet-stock readings/history. | M/A | query/filter | `OK<tank levels>` |
| `/api/tank-levels/[id]/send` | Send/re-send one tank-level record to its downstream integration. | M/A | `P{id}` + optional action body | `OK<send result>` |

### 7.9 Product catalog and categories

| Endpoint | Aim | Access | Request | Expected response |
| --- | --- | --- | --- | --- |
| `/api/product-categories` | List/create product categories. | read application; write A | query or `B<category>` | `OK<categories/category>` |
| `/api/product-categories/[categoryId]` | Read/update/delete one category. | A | `P{categoryId}` + PATCH body | `OK<category/result>` |
| `/api/products` | Query product catalog and create products. | read application; write M/A | query filters or `B<product>` | `OK<products/product>` |
| `/api/products/[productId]` | Read/update one product. | M/A as applicable | `P{productId}` + `B<product patch>` | `OK<product>` |
| `/api/products/[productId]/event-log` | Return one product's event/change log. | M/A | `P{productId}` + query | `OK<events>` |
| `/api/products/[productId]/status` | Return/change product integration/status state. | M/A | `P{productId}` + optional status body | `OK<status>` |
| `/api/products/[productId]/sync` | Synchronize one product with configured downstream/source. | M/A | `P{productId}` + optional sync options | `OK<sync result>` |
| `/api/products/eventLog` | Query product event log across products. | M/A | query filters | `OK<events>` |
| `/api/products/import` | Import product catalog data. | M/A | import payload/file | `OK<import summary>` |
| `/api/products/status` | Return overall product/catalog synchronization status. | M/A | `—`/query | `OK<status>` |

### 7.10 Stock

| Endpoint | Aim | Access | Request | Expected response |
| --- | --- | --- | --- | --- |
| `/api/stock` | Query stock and perform supported stock movements/adjustments. | M/A | GET query; mutation `B<stock movement>` | `OK<stock/result>` |
| `/api/stock/[movementId]/retry` | Retry downstream processing for an eligible stock movement. | M/A | `P{movementId}` + action | `OK<retry result>` |

### 7.11 Proxy configuration

| Endpoint | Aim | Access | Request | Expected response |
| --- | --- | --- | --- | --- |
| `/api/proxy-config` | Read/create/update station proxy configuration entries. | A | read or `B<proxy config>` | `OK<proxy config>` |
| `/api/proxy-config/[key]` | Update one named proxy configuration key. | A | `P{key}` + PATCH `B{value,...}` | `OK<updated value/result>` |

Do not put proxy credentials in logs or URLs.

### 7.12 Receipts

| Endpoint | Aim | Access | Request | Expected response |
| --- | --- | --- | --- | --- |
| `/api/receipts` | List receipts or prepare/render the receipt for a transaction. | T/M/A | GET `Q{transactionId?,list?,preview?}` | receipt payload/list; `404` if selected receipt not found |
| `/api/receipts/print` | Queue/execute supported receipt print workflow. | T/M/A | POST receipt/transaction selection body | `OK<print job/result>` |

#### Receipt preview side effects

When `GET /api/receipts?transactionId=<id>&preview=1` is used and the station has `print_receipt_order=before_fiscalization`, VPOS can prepare and persist receipt state before returning the preview. Do **not** treat this request as a pure read.

For Tanzania, the persisted assignment deliberately uses two date scopes:

- `invoiceNumber` and `dailyCounter` — originating transaction date in station timezone
- `zNumber` and `invoiceDate` — first fiscalization/pre-fiscalization assignment date

Delayed transactions can therefore have different invoice-number and Z-number dates. `(zNumber,dailyCounter)` is not a valid uniqueness assumption. Migration `1320_tanzania_assignment_counter_scope.sql` removes that obsolete database constraint while preserving transaction, invoice-number, and global-counter uniqueness.

### 7.13 Reports

| Endpoint | Aim | Access | Request | Expected response |
| --- | --- | --- | --- | --- |
| `/api/reports` | List/create/query report definitions/runs supported by the UI. | M/A | query or `B<report request>` | `OK<reports/report result>` |
| `/api/reports/[id]` | Retrieve one report/result. | M/A | `P{id}` + optional query | `OK<report>` or report representation |
| `/api/reports/pending` | List pending report jobs/results. | M/A | query | `OK<pending reports>` |
| `/api/reports/reporting` | Query report-oriented aggregate data. | M/A | date/filter query | `OK<reporting data>` |
| `/api/reports/summary` | Return reporting summary/KPIs. | M/A | date/filter query | `OK<summary>` |
| `/api/reports/transactions.csv` | Export transaction report as CSV. | M/A | date/filter query | `text/csv` download |

### 7.14 Runtime fiscal inbox

These are internal administrator/support APIs for inspecting and manipulating the durable fiscal inbox/queue.

| Endpoint | Aim | Request | Expected response |
| --- | --- | --- | --- |
| `/api/runtime/fiscal/inbox` | Query fiscal inbox messages. | query state/date/search/page filters | `OK<fiscal inbox page>` |
| `/api/runtime/fiscal/inbox/[id]` | Read/update one inbox message, including supported state/metadata operations. | `P{id}` + PATCH `B<fiscal inbox patch>` | `OK<message/result>` |
| `/api/runtime/fiscal/inbox/bulk` | Perform supported bulk operations over selected inbox rows. | `B{ids:[...],action,...}` | `OK<bulk result>` |
| `/api/runtime/fiscal/inbox/bulk-clone-requeue` | Clone/requeue selected failed/dead messages. | `B{ids:[...]}` | `OK<clone/requeue result>` |
| `/api/runtime/fiscal/inbox/by-request` | Find inbox records by request/correlation reference. | query request identifier | `OK<messages>` |
| `/api/runtime/fiscal/inbox/export` | Export selected/query-matching fiscal messages as JSON data. | query/body selection | JSON export response |
| `/api/runtime/fiscal/inbox/export-csv` | Export selected/query-matching messages as CSV. | query/body selection | `text/csv` |
| `/api/runtime/fiscal/inbox/export-ndjson` | Export selected/query-matching messages as NDJSON. | query/body selection | NDJSON response |
| `/api/runtime/fiscal/inbox/jump` | Resolve navigation/jump target around a fiscal message. | query target/id | `OK<jump result>` |
| `/api/runtime/fiscal/inbox/requeue-dead` | Requeue eligible unresolved DEAD messages. | selection/action body | `OK<requeue result>` |

### 7.15 Runtime bus and notifications

| Endpoint | Aim | Access | Request | Expected response |
| --- | --- | --- | --- | --- |
| `/api/runtime/bus/publish` | Publish an internal runtime-bus event/message. | Internal/A | `B{topic/type,payload,...}` | `OK<publish result>` |
| `/api/notifications/transactions` | Poll/query transaction notifications for the UI. | authenticated | query cursor/filter | `OK<notifications>` |

### 7.16 Settings: station, pumps, nozzles, tanks, and pump mode

| Endpoint | Aim | Access | Request | Expected response |
| --- | --- | --- | --- | --- |
| `/api/settings` | Read/update station settings used by application workflows. | M/A | read or `B<settings patch>` | `OK<settings>` |
| `/api/settings/pump-mode` | Read/update configured pump operating mode. | M/A | read or `B<pump mode>` | `OK<pump mode>` |
| `/api/settings/pumps` | List/update pump settings. | M/A | GET `—`; PUT `B<pump setting>` | `OK<pumps/pump>` |
| `/api/settings/pumps/[id]` | Read/update one pump configuration. | M/A | `P{id}` + domain patch | `OK<pump>` |
| `/api/settings/pumps/[id]/nozzles` | Read/replace/delete nozzle mapping for a pump. | M/A | `P{id}`; PUT `B<nozzle mapping>`; DELETE selection | `OK<nozzles/result>` |
| `/api/settings/tanks` | List/update/delete tank settings. | M/A | GET; PUT `B<tank setting>`; DELETE `B<tank selector>` | `OK<tanks/result>` |
| `/api/settings/tanks/atg-polling` | Update ATG/tank-gauge polling configuration. | M/A | PUT `B<ATG polling settings>` | `OK<settings>` |
| `/api/settings/tanks/sync-volumes` | Capture/synchronize tank gauge volumes into configured tank state. | M/A | action body/options | `OK<sync result>` |

### 7.17 Setup/bootstrap APIs

These routes support initial station setup and can use special setup context before normal authenticated operation is available. They are not external partner APIs.

| Endpoint | Aim | Request | Expected response |
| --- | --- | --- | --- |
| `/api/setup/admin` | Create/configure initial administrator/setup account state. | `B{username,password,fullName?,deviceRegistered?}` and setup context | `OK<setup/admin result>` or validation failure |
| `/api/setup/check-device-certificate` | Check setup-time device certificate readiness. | device/setup input if required | `OK<check>` |
| `/api/setup/check-printer-page-width` | Check configured printer page width. | printer/setup input | `OK<check>` |
| `/api/setup/complete-setup` | Complete setup workflow using current setup state. | completion body/context | `OK<setup result>` |
| `/api/setup/device` | Read/save device configuration during setup. | `B<device setup>` | `OK<device>` |
| `/api/setup/device-configured` | Check/record device-configured state. | optional body | `OK<state>` |
| `/api/setup/forecourt` | Read/save setup-time forecourt configuration/mapping. | `B<forecourt setup>` | `OK<forecourt setup>` |
| `/api/setup/proxy-status` | Check proxy connectivity/registration status during setup. | `—`/query | `OK<proxy status>` |
| `/api/setup/site` | Read/save site profile during setup. | `B<site profile>` | `OK<site>` |
| `/api/setup/status` | Return overall setup state/readiness. | `—` | `OK<setup status>` |
| `/api/setup/tanzania-fiscal` | Read/save Tanzania fiscal setup data. | `B<Tanzania fiscal setup>` | `OK<Tanzania setup>` |
| `/api/setup/test-report-printout` | Test report printer output during setup. | `B<printer test>` | `OK<print result>` |
| `/api/setup/test-transaction-printout` | Test transaction receipt output during setup. | `B<printer test>` | `OK<print result>` |
| `/api/setup/validate-device-registration` | Validate device registration before setup completion. | registration/setup context | `OK<validation>` |
| `/api/setup/validate-setup` | Validate saved setup state. | optional setup context | `OK<validation>` |
| `/api/setup/validate-setup-payload` | Validate supplied setup payload without committing it. | `B<setup payload>` | `OK<validation>` |

### 7.18 Startup and general status

| Endpoint | Aim | Access | Request | Expected response |
| --- | --- | --- | --- | --- |
| `/api/startup/status` | Report startup/bootstrap progress. | Internal/support | `—` | startup status JSON |
| `/api/status` | Return authenticated station/application status for normal UI. | T/M/A | `—` | `OK<status>` |

### 7.19 Tanzania daily totals

| Endpoint | Aim | Access | Request | Expected response |
| --- | --- | --- | --- | --- |
| `/api/tanzania/daily-totals` | Query Tanzania station-local daily fiscal/transaction totals. | authenticated Tanzania roles | date/query parameters | `OK<daily totals>` |

Use station timezone/business-date rules. Do not derive Tanzania daily counter semantics from UTC date truncation.

### 7.20 Transactions

| Endpoint | Aim | Access | Request | Expected response |
| --- | --- | --- | --- | --- |
| `/api/transactions` | Search/list transaction records; POST also supports the route's receipt-print enqueue workflow rather than generic transaction creation. | GET T/M/A; mutation M/A | GET query below; POST print-related body | `OK<transaction page>` / print result |
| `/api/transactions/[id]` | Retrieve/update supported state for one transaction. | authenticated | `P{id}` + domain input where mutating | `OK<transaction>` |
| `/api/transactions/[id]/cancel-fiscalization` | Cancel an eligible fiscalization workflow. | privileged | `P{id}` + cancellation/reason body | `OK<cancellation result>` |
| `/api/transactions/[id]/credit-note` | Create/query a credit note for the source transaction. | authorized fiscal roles | `P{id}` + `B{reason,...}` | `OK<credit note>` |
| `/api/transactions/[id]/credit-note/print` | Print the credit-note receipt/document. | authorized | `P{id}` + print options | `OK<print result>` |
| `/api/transactions/[id]/fiscalize` | Fiscalize one selected transaction. | authorized fiscal roles | `P{id}` + optional fiscalization input | `OK<fiscalization result>` |
| `/api/transactions/[id]/invoice-payload` | Build/return the invoice payload for inspection/support. | privileged/internal | `P{id}` | `OK<invoice payload>` |
| `/api/transactions/[id]/lines` | Return transaction line items. | authenticated | `P{id}` | `OK<lines>` |
| `/api/transactions/[id]/receipt` | Return/build receipt data associated with one transaction. | authenticated | `P{id}` + optional preview/query | receipt payload |
| `/api/transactions/[id]/retry` | Retry an eligible failed transaction/fiscal workflow. | authorized | `P{id}` + optional retry context | `OK<retry result>` |
| `/api/transactions/allocate` | Allocate/associate a pending forecourt transaction to the POS workflow/customer context. | T/M/A as configured | `B<allocation>` | `OK<allocation result>` |
| `/api/transactions/fiscalize` | Fiscalize a transaction selected through request body rather than path. | authorized | `B{transactionId,...}` | `OK<fiscalization result>` |
| `/api/transactions/fuel-options` | Return fuel-related options needed by transaction UI/manual entry. | authenticated | optional query | `OK<fuel options>` |
| `/api/transactions/manual` | Create/process a supported manual transaction. | authorized | `B<manual transaction>` | `OK<transaction/result>` |
| `/api/transactions/non-fiscalized` | Query non-fiscalized transactions. | M/A | date/search/page query | `OK<transactions>` |
| `/api/transactions/pending` | Query pending transaction work. | authenticated/management | query filters | `OK<pending transactions>` |
| `/api/transactions/pre-fuel-customer` | Read/update customer details associated before fueling. | T/M/A | query or `B<customer/pre-fuel context>` | `OK<context>` |
| `/api/transactions/reporting` | Query reporting-oriented transaction data. | M/A | date/filter/page query | `OK<reporting data>` |
| `/api/transactions/send-now` | Force/trigger immediate send for an eligible transaction. | privileged | `B{transactionId,...}` | `OK<send result>` |

#### `GET /api/transactions` query parameters

Current supported aliases/filters include:

| Parameter | Meaning |
| --- | --- |
| `limit` | result limit where supported by the query service |
| `page` | page number |
| `pageSize` | page size |
| `status` | include transaction status |
| `excludeStatus` | exclude a status |
| `scope` | `all`, `non-fiscalized`, or `fiscalized` |
| `transactionId` | find one transaction ID |
| `pumpNumber` / `pump` | pump filter |
| `search` / `q` | general search |
| `from` / `to` | date/time range |
| `startDate` / `endDate` | supported date-filter aliases |

Example:

```http
GET /api/transactions?scope=fiscalized&page=1&pageSize=50
```

Expected response family:

```json
{
  "ok": true,
  "success": true,
  "data": {
    "...transaction page fields...": "..."
  }
}
```

### 7.21 Users

| Endpoint | Aim | Access | Request | Expected response |
| --- | --- | --- | --- | --- |
| `/api/users` | List/create/update station users under role rules. | M/A | GET; POST `B<user create>`; PATCH `B<user update>` | `OK<users/user>` |
| `/api/users/[id]` | Read/delete one user under role rules. | M/A | `P{id}`; DELETE with confirmation/context where required | `OK<user/result>` |

Do not expose password hashes or session tokens through integrations. Manager actions remain bounded by application role rules even where the route itself permits manager access.

### 7.22 Editor/internal configuration-file endpoint

| Endpoint | Aim | Access | Request | Expected response |
| --- | --- | --- | --- | --- |
| `/api/editor/[filename]` | Read/write/delete an allow-listed editable configuration/resource file. | privileged/internal | `P{filename}` + file/text body on write | file/content result or deletion acknowledgement |

This is an administrative implementation interface, not a general filesystem API.

## 8. POS/DOMS command API family

The following routes are HTTP adapters around DOMS/JPL forecourt commands. They are used by the VPOS application/engineering controls and are **not** a public replacement for the DOMS/JPL protocol.

Current route pattern for these adapters is a protected `POST` available to `tenant`, `manager`, or `administrator` where the command route specifies those roles; the shared POS DOMS routes explicitly use `csrf: false`. Request bodies are JSON objects and the dispatcher returns the legacy DOMS success/failure family.

A normal request can be direct JSON:

```json
{
  "tankId": "01"
}
```

For a subset of commands, the adapter also accepts the object under `data`:

```json
{
  "data": {
    "tankId": "01"
  }
}
```

A successful response is wrapped through the legacy DOMS success helper; failures use the corresponding legacy DOMS failure helper. Treat the nested `data` as the current DOMS command result, not a stable third-party schema.

### 8.1 Complete `/api/pos/doms/*` catalog

| Endpoint | Aim | Expected request |
| --- | --- | --- |
| `/api/pos/doms/blockTank` | Block a tank in the supported DOMS tank-control workflow. | `B{tankId/TankId or tgId/TgId,...}` |
| `/api/pos/doms/changeDynamicTankData` | Change supported dynamic tank-gauge/controller data. | `B<dynamic tank data>`; direct or under `data` |
| `/api/pos/doms/changeFcDateTime` | Change forecourt-controller date/time. | `B<FC date/time>`; direct or under `data` |
| `/api/pos/doms/changeFcOperationMode` | Change forecourt-controller operation mode. | `B<operation mode>`; direct or under `data` |
| `/api/pos/doms/changeGradePrices` | Submit/change grade prices and persist pending price-set/event state where applicable. | `B<grade-price payload>` |
| `/api/pos/doms/clearFallbackTotals` | Clear supported fallback totals. | `B<clear context>`; direct or under `data` |
| `/api/pos/doms/clearPendingPriceSet` | Remove a pending scheduled price set. | see explicit payload below |
| `/api/pos/doms/clearTankDeliveryData` | Clear acknowledged tank-delivery checkpoint data. | see explicit payload below |
| `/api/pos/doms/clearTgError` | Clear a tank-gauge error. | `B{tankId/TankId or tgId/TgId,...}` |
| `/api/pos/doms/closeTankController` | Close/disable the selected tank-controller path. | `B{tankId/TankId,...}` |
| `/api/pos/doms/getAllTankDeliveryData` | Read all available tank-delivery records. | command body `{}` or supported DOMS options |
| `/api/pos/doms/getAllTgData` | Read all tank-gauge data. | command body `{}` or supported DOMS options |
| `/api/pos/doms/getFallbackTotals` | Read fallback totals. | command body/options |
| `/api/pos/doms/getFcDateTime` | Read forecourt-controller date/time. | command body `{}` |
| `/api/pos/doms/getFcOperationModeStatus` | Read forecourt operation-mode status. | command body `{}` |
| `/api/pos/doms/getFpGradeTotals` | Read fuelling-point grade totals. | `B<FP/grade selector>` |
| `/api/pos/doms/getGradePrices` | Read grade prices. | selector/options body |
| `/api/pos/doms/getPumpGradeBlendTotals` | Read pump/grade/blend totals. | selector body |
| `/api/pos/doms/getPumpGradeTotals` | Read pump/grade totals. | selector body |
| `/api/pos/doms/getSiteDeliveryStatus` | Read site delivery status. | command body/options |
| `/api/pos/doms/getTankControlStatus` | Read tank-control status. | selector body |
| `/api/pos/doms/getTgErrorMsg` | Read tank-gauge error message/details. | tank/TG selector; direct or under `data` |
| `/api/pos/doms/getTgStatus` | Read tank-gauge status. | tank/TG selector |
| `/api/pos/doms/markDeliveryFinished` | Mark a delivery lifecycle as finished. | tank/TG/delivery payload; direct or under `data` |
| `/api/pos/doms/markDeliveryStarting` | Mark a delivery lifecycle as starting. | tank/TG/delivery payload; direct or under `data` |
| `/api/pos/doms/openTankController` | Open/enable selected tank-controller path. | `B{tankId/TankId,...}` |
| `/api/pos/doms/resetTg` | Reset supported tank-gauge state. | tank/TG selector |
| `/api/pos/doms/startDeliveryProcess` | Start supported delivery process for a tank. | `B{tankId/TankId,...}` |
| `/api/pos/doms/stopDeliveryProcess` | Stop supported delivery process for a tank. | `B{tankId/TankId,...}` |
| `/api/pos/doms/unblockTank` | Unblock a tank. | tank/TG selector |
| `/api/pos/doms/utilEcho` | DOMS utility echo/diagnostic command. | arbitrary echo payload; direct or under `data` |

`clearPendingPriceSet` accepts current field aliases such as:

```json
{
  "activationAt": "20260908120000",
  "priceSetId": 123
}
```

Aliases accepted by the shared adapter include `priceSetActivationDateAndTime` / `PriceSetActivationDateAndTime` and `fcPriceSetId` / `FcPriceSetId`.

`clearTankDeliveryData` accepts the current shape/aliases:

```json
{
  "deliveryReportSeqNo": "12",
  "posId": "01",
  "tankDeliveries": [
    {
      "tgId": "01",
      "tankDeliverySeqNo": "34"
    }
  ]
}
```

Upper-camel aliases (`DeliveryReportSeqNo`, `PosId`, `TankDeliveries`, `TgId`, `TankDeliverySeqNo`) are also normalized by the shared adapter.

### 8.2 POS control routes

| Endpoint | Aim | Request | Expected response |
| --- | --- | --- | --- |
| `/api/pos/control/attendantAuth` | Submit/resolve attendant authorization control. | `B<attendant auth>` | POS control result |
| `/api/pos/control/clearFpError` | Clear supported fuelling-point error. | `B<FP selector/error context>` | control result |
| `/api/pos/control/clearPreFuelCustomer` | Clear pre-fuel customer association. | `B<FP/transaction context>` | control result |
| `/api/pos/control/closeFps` | Close selected fuelling points. | `B<FP selection>` | control result |
| `/api/pos/control/openFps` | Open selected fuelling points. | `B<FP selection>` | control result |
| `/api/pos/control/preFuelCustomer` | Set pre-fuel customer association. | `B<customer + FP context>` | control result |
| `/api/pos/control/print` | Submit POS-side print/control request. | `B<print command>` | print/control result |

### 8.3 POS event routes

| Endpoint | Aim | Request | Expected response |
| --- | --- | --- | --- |
| `/api/pos/events/attendantAuthRequest` | Record/consume attendant authorization request event. | event payload/query | event result |
| `/api/pos/events/clear-attendant-auth` | Clear pending attendant-auth event state. | selection/action | acknowledgement |
| `/api/pos/events/pending-attendant-auth` | Read pending attendant-auth requests. | query | pending event list |

### 8.4 POS catalog/status

| Endpoint | Aim | Request | Expected response |
| --- | --- | --- | --- |
| `/api/pos/catalog` | Return POS-facing product/fuel catalog. | optional query | `OK<catalog>` |
| `/api/pos/status` | Return POS integration/runtime status. | `—` | `OK<POS status>` |

## 9. VPOS compatibility API family

These routes retain internal/legacy VPOS workflow contracts. They are not a versioned external partner API.

| Endpoint | Aim | Request | Expected response |
| --- | --- | --- | --- |
| `/api/vpos/capture-customer-details` | Capture customer details into current VPOS transaction workflow. | `B<customer details>` | compatibility success/result |
| `/api/vpos/clear-customer-details` | Clear captured customer transaction context. | context/selector body | acknowledgement |
| `/api/vpos/complete-transaction` | Complete supported VPOS transaction workflow. | `B<transaction completion>` | transaction result |
| `/api/vpos/config/availablePlugins` | Return available runtime plugins. | `—` | plugin list |
| `/api/vpos/config/pluginSchema/[name]` | Return configuration schema for one plugin. | `P{name}` | schema JSON |
| `/api/vpos/config/processSchema/[name]` | Return configuration schema for one process. | `P{name}` | schema JSON |
| `/api/vpos/config/status` | Return VPOS configuration status. | `—` | status JSON |
| `/api/vpos/daily-data` | Return VPOS daily operational data. | date/query | daily data |
| `/api/vpos/daily-totals/recompute` | Recompute supported daily totals. | date/options action body | recompute result |
| `/api/vpos/pos/command` | Dispatch a legacy/general POS command. | `B{command,...}` | POS command result |
| `/api/vpos/pos-status` | Return compatibility POS status. | `—` | status JSON |
| `/api/vpos/reload-config` | Reload VPOS runtime configuration. | action | reload result |
| `/api/vpos/restart` | Request supported VPOS restart workflow. | action/options | restart result |
| `/api/vpos/restart-config` | Return/update restart configuration as supported. | config body/query | restart config/result |
| `/api/vpos/restart-log-clear` | Clear restart-log state. | action | acknowledgement |
| `/api/vpos/restart-log-content` | Read restart log content. | query such as line limit | log content |
| `/api/vpos/restart-status` | Return restart/recovery status. | `—` | status JSON |
| `/api/vpos/safety-check` | Evaluate safety/readiness before a sensitive VPOS action. | `B<safety context>` | safety-check result |
| `/api/vpos/status` | Return legacy/general VPOS status. | `—` | status JSON |

## 10. Other log compatibility endpoints

| Endpoint | Aim | Access | Request | Expected response |
| --- | --- | --- | --- | --- |
| `/api/logs` | Console-compatible logs API. | A | read/action body depending operation | log result |
| `/api/logs/archive` | Archive eligible logs through compatibility path. | A | action | archive result |
| `/api/logs/content` | Read a selected log file. | A | `Q{type,filename,lines}` | log content |
| `/api/logs/list` | List available logs. | A | `Q{type?}` | log list |

## 11. Request and response details that require special care

### 11.1 Domain-generic bodies are not an external schema

A number of handlers deliberately accept `Record<string, unknown>` or similar and immediately pass the object to a domain application service. The catalog labels those requests `B<domain>`.

That means:

- the HTTP layer does not define a stable public schema by itself;
- accepted fields may be validated in another module;
- new fields can appear without changing the route file;
- consumers must not treat the examples in this guide as an OpenAPI guarantee.

If one of these endpoints is to become a supported partner interface, freeze the schema in a versioned contract and add contract tests.

### 11.2 Date/time handling

Station timezone is authoritative for business-day behavior. Always transmit unambiguous timestamps and preserve offsets where accepted.

For Tanzania, originating transaction date and receipt/fiscal assignment date can both be authoritative for different fields on the same receipt. Do not infer one from the other.

### 11.3 Retries and idempotency

There is no blanket `Idempotency-Key` contract across current internal mutations.

- Liveness/readiness/health can normally be polled safely.
- Do not assume every internal GET is side-effect free.
- Do not blindly retry fiscalization, receipt preview, print, pricing, maintenance, tank-control, or transaction mutations after an ambiguous timeout.
- Determine whether the prior request created durable state first.

Tanzania receipt assignments are intentionally persisted and reused for the same transaction; a retry must not expect fresh global/daily/invoice numbering.

## 12. HTTP status handling

Common status classes include:

| Status | Typical meaning |
| --- | --- |
| `200` | successful query/action |
| `201` | created resource/action where used |
| `303` | HTML/form redirect used by some browser-aware routes |
| `400` | validation failure/bad request |
| `401` | authentication required or invalid credentials |
| `403` | insufficient role/authorization or CSRF failure depending route |
| `404` | route/domain record not found |
| `409` | state/conflict condition where implemented |
| `410` | intentionally retired/deprecated action, e.g. legacy system reboot behavior |
| `500` | internal/unhandled error; correlate `requestId` with authorized logs |

Do not parse human-readable error text when `error.code` is available.

When escalating, preserve:

- method and path
- safe query parameters
- local/UTC timestamp with timezone
- HTTP status
- `error.code`
- `error.requestId`
- station identifier
- transaction/receipt/job/device identifiers involved

Never include passwords, session cookies, private keys, fiscal secrets, proxy credentials, or CSRF tokens in support tickets/log excerpts.

## 13. Endpoint stability classification

| Class | Meaning | Examples |
| --- | --- | --- |
| Operational public | intended for local monitoring; still network-restrict | `/api/livez`, `/api/readyz`, `/api/healthz`, `/api/metrics` |
| Contracted integration | stable only when separately frozen for a partner | none established globally by this repository at this baseline |
| Internal application API | VPOS UI/business workflow; may change | customers, transactions, receipts, products, reports, settings |
| Setup/bootstrap | commissioning-only | `/api/setup/*`, `/api/admin/setup/*` |
| Privileged engineering | diagnostics, maintenance, recovery, system control | `/api/admin/forecourt/*`, `/api/admin/system/*`, supervisor/control routes |
| Compatibility adapter | wraps legacy/internal protocols/contracts | `/api/pos/doms/*`, `/api/doms/[command]`, `/api/vpos/*`, `/api/terminal/[command]` |

## 14. Recommended design for a future third-party business API

Do not expose the full internal route inventory as the long-term partner contract. A production machine-to-machine API should instead provide:

- a versioned namespace such as `/api/integrations/v1/...`
- service credentials independent of human users
- explicit per-client scopes
- TLS and, where appropriate, mTLS
- stable request/response schemas
- an OpenAPI specification
- consistent pagination/filtering
- explicit safe/idempotent semantics
- idempotency keys for retry-sensitive writes
- rate limits
- audit records identifying the external client
- documented deprecation/version policy
- CI contract tests

For sessionless machine authentication, CSRF should not be the primary security mechanism; authentication and authorization should be designed specifically for non-browser clients.

## 15. Integration approval checklist

Before approving a third party to consume any business route, define:

- [ ] owning component (`vpos-ftc-app`, `vpos-proxy`, or another service)
- [ ] exact path and HTTP method
- [ ] endpoint version
- [ ] authentication mechanism
- [ ] roles/scopes/authorization rules
- [ ] allowed source networks
- [ ] exact request schema
- [ ] exact success schema
- [ ] exact error codes/schema
- [ ] pagination/filtering semantics
- [ ] date/time/business-day semantics
- [ ] retry and idempotency rules
- [ ] side effects
- [ ] expected request volume/rate limits
- [ ] timeout behavior
- [ ] audit requirements
- [ ] privacy/security classification
- [ ] backward-compatibility/deprecation policy
- [ ] staging/test procedure
- [ ] operational support/escalation path

If these are not defined, treat the route as internal.

## 16. Related documentation

- [Technician Setup Guide](TECHNICIAN_SETUP_GUIDE.md)
- [Management Guide](MANAGEMENT_GUIDE.md)
- [Architecture](../ARCHITECTURE.md)
- [Configuration](../configuration.md)
- [Transactions and fiscalization](../domains/transactions.md)
- [Tanzania fiscalization](../domains/tanzania-fiscalization.md)
- [Forecourt and DOMS/JPL](../domains/forecourt.md)
- [Runtime and workers](../domains/runtime-workers.md)
- [Production debugging](../runbooks/production-debugging.md)

## 17. Summary

The complete `/api` route surface is intentionally broader than a normal third-party API because it serves the browser UI, setup wizard, local station operations, diagnostics, maintenance, compatibility adapters, DOMS/JPL control, fiscal queues, and runtime support from one application.

Use `/api/livez`, `/api/readyz`, `/api/healthz`, and `/api/metrics` as the clearly identified operational monitoring surface. For business integration, select only the required capabilities and formalize them behind a dedicated versioned contract rather than coupling an external system to the full internal route inventory.
