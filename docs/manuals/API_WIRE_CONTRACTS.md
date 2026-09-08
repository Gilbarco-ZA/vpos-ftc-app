# VPOS FTC Installed-Package API Wire Contract Reference

**Companion to:** [API_GUIDE.md](./API_GUIDE.md)  
**Audience:** developers integrating against an installed VPOS FTC package without repository/source access.  
**Baseline:** `vpos-ftc-app` `3058ac6bc63073556dfd3d41d7869ab181773d6c` on 2026-09-08.

## 1. Which document is authoritative for request/response code?

Use this wire-contract reference and its linked contract files when writing HTTP client models.

The endpoint catalog in `API_GUIDE.md` remains the inventory/purpose/security overview. Any older shorthand in that catalog such as `B<...>`, `OK<...>`, `Direct<...>`, or a prose phrase like “domain payload” is **not a complete client schema**. The wire-contract documents below supersede that shorthand by defining the actual JSON/text/file boundary.

A client should be able to implement request and response types from these documents without opening the `vpos-ftc-app` source repository.

## 2. Contract documents

| Contract | Covers |
| --- | --- |
| [COMMON_AND_AUTH.md](./api-contracts/COMMON_AND_AUTH.md) | success/failure envelopes, authentication, session user, CSRF, liveness, readiness, health, metrics |
| [BUSINESS.md](./api-contracts/BUSINESS.md) | customers, transactions, transaction lines/allocation/fiscalization, pre-fuel customer flow, receipts, products |
| [CATALOG_STOCK_REPORTING_MISC.md](./api-contracts/CATALOG_STOCK_REPORTING_MISC.md) | product categories, stock, reports/exports, proxy config, assets, config dictionaries |
| [SETTINGS_SETUP_ADMIN.md](./api-contracts/SETTINGS_SETUP_ADMIN.md) | console settings, station settings, pumps, tanks, ATG, pump mode, forecourt settings, users, setup, branding, admin config |
| [RUNTIME_SUPPORT.md](./api-contracts/RUNTIME_SUPPORT.md) | fiscal inbox list/detail/actions/bulk/export, runtime bus |
| [FORECOURT_AND_COMPATIBILITY.md](./api-contracts/FORECOURT_AND_COMPATIBILITY.md) | POS/DOMS, JPL selectors, POS control, generic DOMS/control/terminal, maintenance preview, compatibility boundary |

## 3. Endpoint-to-contract map

The table maps the installed package endpoint families to the wire contract that defines the request/response shape.

| Endpoint or family | Wire contract |
| --- | --- |
| `/api/livez` | COMMON_AND_AUTH §9 |
| `/api/readyz` | COMMON_AND_AUTH §10 |
| `/api/healthz` | COMMON_AND_AUTH §11 |
| `/api/metrics` | COMMON_AND_AUTH §12 |
| `/api/auth/login` | COMMON_AND_AUTH §4 |
| `/api/auth/logout` | COMMON_AND_AUTH §5 |
| `/api/auth/session` | COMMON_AND_AUTH §6 |
| `/api/security/csrf` | COMMON_AND_AUTH §7 |
| `/api/customers`, `/api/customers/{id}`, `/lookup`, `/search` | BUSINESS §§1–2 |
| `/api/transactions` | BUSINESS §4.1–4.2 |
| `/api/transactions/{id}` | BUSINESS §4.3 |
| `/api/transactions/allocate` | BUSINESS §4.4 |
| `/api/transactions/manual` | BUSINESS §4.5 |
| `/api/transactions/fuel-options` | BUSINESS §4.6 |
| `/api/transactions/{id}/lines` | BUSINESS §4.7–4.8 |
| `/api/transactions/{id}/fiscalize` | BUSINESS §4.9 |
| `/api/transactions/pre-fuel-customer` | BUSINESS §4.10–4.11 |
| `/api/receipts` | BUSINESS §§5–6 |
| `/api/products` | BUSINESS §§7–8 |
| `/api/product-categories`, `/api/product-categories/{categoryId}` | CATALOG_STOCK_REPORTING_MISC §1 |
| `/api/stock`, `/api/stock/{movementId}/retry` | CATALOG_STOCK_REPORTING_MISC §§2–4; retry route uses selected movement ID and action result |
| `/api/reports`, `/api/reports/*` | CATALOG_STOCK_REPORTING_MISC §5 |
| `/api/proxy-config`, `/api/proxy-config/{key}` | CATALOG_STOCK_REPORTING_MISC §6; key route targets one proxy KV key |
| `/api/config/*` lookup/dictionary routes | CATALOG_STOCK_REPORTING_MISC §8 |
| `/api/settings` | SETTINGS_SETUP_ADMIN §1 |
| `/api/admin/settings` | SETTINGS_SETUP_ADMIN §2 |
| `/api/settings/pumps*` | SETTINGS_SETUP_ADMIN §3 |
| `/api/settings/tanks*` | SETTINGS_SETUP_ADMIN §§4–5 |
| `/api/settings/pump-mode` | SETTINGS_SETUP_ADMIN §6 |
| `/api/admin/setup/forecourt-settings` | SETTINGS_SETUP_ADMIN §7 |
| `/api/users`, `/api/users/{id}` | SETTINGS_SETUP_ADMIN §8 |
| `/api/setup/admin` | SETTINGS_SETUP_ADMIN §9 |
| `/api/setup/device` | SETTINGS_SETUP_ADMIN §10 |
| `/api/setup/site` | SETTINGS_SETUP_ADMIN §11 |
| `/api/setup/status` | SETTINGS_SETUP_ADMIN §12 |
| `/api/setup/forecourt` | SETTINGS_SETUP_ADMIN §13 |
| `/api/setup/proxy-status` | SETTINGS_SETUP_ADMIN §14 |
| `/api/admin/branding` and branding asset behavior | SETTINGS_SETUP_ADMIN §15 |
| `/api/admin/config/devices`, `/plugins`, `/station` | SETTINGS_SETUP_ADMIN §16 |
| `/api/runtime/fiscal/inbox*` | RUNTIME_SUPPORT §§1–9 |
| `/api/runtime/bus/publish` | RUNTIME_SUPPORT §10 |
| `/api/pos/doms/*` | FORECOURT_AND_COMPATIBILITY §§1–4 |
| `/api/pos/control/*` | FORECOURT_AND_COMPATIBILITY §5 |
| `/api/doms/{command}` | FORECOURT_AND_COMPATIBILITY §6 |
| `/api/control/{module}/{command}` | FORECOURT_AND_COMPATIBILITY §7 |
| `/api/terminal/{command}` | FORECOURT_AND_COMPATIBILITY §8 |
| `/api/admin/forecourt/maintenance/preview` | FORECOURT_AND_COMPATIBILITY §9 |
| `/api/supervisor/*`, `/api/vpos/*` compatibility families | FORECOURT_AND_COMPATIBILITY §10 plus the endpoint catalog for path/method/aim |

## 4. How to interpret `unknown` and `Record<string, unknown>`

These are real wire types, not documentation omissions.

`unknown` means the HTTP layer permits any JSON value at that position. `Record<string, unknown>` means the HTTP layer requires/uses a JSON object but does not freeze its nested keys.

This occurs when another installed component owns the nested protocol, for example:

- a JPL/DOMS command payload;
- a proxy registration/status object;
- a country fiscalization raw payload;
- a runtime-bus message;
- a report repository record;
- extensible station/proxy configuration JSON.

Where VPOS itself validates fields, those fields are listed explicitly in the contract documents. A third party must not infer additional fields from a descriptive endpoint name.

## 5. Naming on the wire

Do not globally camel-case or snake-case responses.

The current package contains both:

- normalized camelCase DTOs, e.g. customer detail, stock DTOs, fuel options;
- raw PostgreSQL-shaped snake_case rows, e.g. transaction lists, receipt lists, station settings;
- compatibility responses with their own envelope, e.g. DOMS `{success,message,data}`;
- direct responses with no shared envelope, e.g. receipt detail, CSRF, setup status, user detail.

The individual contract section states which form applies.

## 6. Numeric values

Normalized DTOs generally emit JSON numbers. Raw PostgreSQL-shaped endpoints can expose database `DECIMAL`/`NUMERIC` values as JSON strings depending on the installed PostgreSQL driver numeric parser. For raw transaction/database records, client models should accept `number | string` where the contract says so and normalize explicitly with decimal-safe code.

Do not use binary floating-point arithmetic for fiscal reconciliation where exact decimal behavior matters.

## 7. Content-type dispatch

Before JSON deserialization, inspect HTTP status and `Content-Type`.

The installed package can return:

- JSON;
- Prometheus text (`/api/metrics`);
- CSV report/fiscal exports;
- NDJSON fiscal exports;
- HTML/plain receipt presentation fields inside JSON;
- binary/image/file responses for approved asset/download endpoints;
- HTTP `303` redirects for browser/form-aware authentication/setup behavior.

## 8. Error handling contract

Use `COMMON_AND_AUTH.md` for the shared error shapes. Some legacy/direct routes have route-specific failures documented in their contract section.

Client code should record at least:

```ts
interface ApiFailureContext {
  httpStatus: number
  method: string
  path: string
  errorCode?: string
  requestId?: string
}
```

Do not branch on human-readable `error.message` when a machine code or action/status field exists.

## 9. Retry behavior

Do not assume that `GET` implies no state changes. Receipt preview is the principal current example: preview can reserve/persist receipt identity before fiscalization when configured for before-fiscalization printing.

Do not automatically replay ambiguous-timeout writes for:

- fiscalization;
- receipt preview/printing;
- transaction allocation/editing;
- stock movement creation;
- DOMS/JPL controls;
- price-set changes;
- tank delivery clearing;
- maintenance/reconciliation;
- fiscal inbox requeue/clone/delete actions.

Read current state first.

## 10. Route families not yet suitable as a partner contract

The complete route inventory in `API_GUIDE.md` includes administrative diagnostics, archive/retention, maintenance/reconciliation, supervisor, legacy import, secure artifact, recovery, editor, and compatibility APIs. If a specific route in those families is to be exposed to an external developer, treat the exact HTTP implementation boundary as the contract:

- concrete parsed fields must be documented before release;
- an unparsed JSON body is `Record<string, unknown>`;
- a registered-handler result without a frozen DTO is `unknown`/`Record<string, unknown>`;
- file/text responses must declare content type;
- the endpoint should ideally receive a versioned integration wrapper before being presented as a supported external API.

This rule prevents the old endpoint-name-based placeholders from being mistaken for usable schemas.

## 11. Versioning recommendation

These documents describe the installed package baseline above. They do not create a versioned public API by themselves. A supported partner API should ultimately freeze these DTOs in a versioned namespace/OpenAPI document and test that contract in CI.
