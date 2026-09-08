# VPOS FTC API Guide for Third-Party Developers

**Audience:** Approved third-party developers, integrators, monitoring teams, and solution architects  
**Purpose:** Describe the current HTTP API surface of an installed VPOS FTC station and the boundary between supported operational endpoints and internal application APIs.  
**Documentation baseline:** reviewed against `vpos-ftc-app` `main` commit `bbd11ab2ee9d364fd96771c7f4119d0199a03923` on 2026-09-08

## 1. Current API status

The current `vpos-ftc-app` exposes HTTP endpoints under `/api`, but it is **not yet a general-purpose, versioned machine-to-machine API product**.

Most business endpoints are application APIs used by the VPOS web interface. They normally require a VPOS authenticated user session, enforce role permissions, and require CSRF protection for mutations. The current repository does not provide a general Bearer-token or API-key authentication contract for third-party applications, and no versioned OpenAPI contract is currently published by this repository.

Third-party developers should therefore distinguish between:

1. **public operational endpoints** that can be queried without a VPOS user session; and
2. **session-protected application endpoints**, which must not be treated as a stable external contract unless an explicit integration agreement says otherwise.

Do not build a production integration by scraping browser behavior or depending on undocumented internal routes.

A route using HTTP `GET` is also not automatically side-effect free in the current internal application API. For example, receipt preview can prepare and persist receipt identity when the station is configured to print before fiscalization. This is one reason internal routes must not be treated as a conventional external REST contract without explicit documentation.

## 2. Base URL

Examples in this guide use:

```text
<VPOS_BASE_URL>
```

For example:

```text
https://station-vpos.example.local
```

The actual hostname, port, TLS termination, and station-network exposure are deployment-specific.

Third-party systems should access VPOS only through an approved station-network path. Do not expose the station application directly to the public Internet solely to simplify an integration.

## 3. Response conventions

Most JSON API helpers use a common success envelope:

```json
{
  "ok": true,
  "success": true,
  "data": {}
}
```

A created resource may use HTTP `201` with the same success structure.

Application failures generally use:

```json
{
  "ok": false,
  "success": false,
  "error": {
    "message": "..."
  }
}
```

Authentication, authorization, validation, and internal errors can additionally include fields such as:

```json
{
  "ok": false,
  "success": false,
  "error": {
    "code": "UNAUTHORIZED",
    "message": "...",
    "requestId": "..."
  }
}
```

Internal errors can use a generic client-facing message such as `Internal server error` while station-side logs retain the underlying exception. Preserve `requestId` when reporting an API error to station support; it is the correlation key between the visible response and server-side diagnostics.

Not every endpoint returns the generic JSON envelope. `/api/metrics`, for example, returns Prometheus text.

## 4. Supported public operational endpoints

The following endpoints are currently implemented without VPOS user-session authentication.

### 4.1 Liveness

```http
GET /api/livez
```

Purpose: confirm that the VPOS HTTP process has started and can answer requests.

Current response:

```json
{
  "ok": true,
  "success": true,
  "status": "running"
}
```

Example:

```bash
curl -fsS '<VPOS_BASE_URL>/api/livez'
```

**Important:** a successful liveness response does not prove that PostgreSQL, workers, DOMS/JPL, printers, or fiscal/proxy services are healthy.

### 4.2 Readiness

```http
GET /api/readyz
```

Purpose: obtain deeper application readiness for the station runtime.

Example:

```bash
curl -fsS '<VPOS_BASE_URL>/api/readyz'
```

Treat readiness as the preferred signal when deciding whether the station application is ready to serve normal operations. Consumers should tolerate the detailed readiness object evolving unless a separate contract freezes the schema.

### 4.3 Health

```http
GET /api/healthz
```

Purpose: obtain station runtime health information.

The endpoint wraps the current health object in the normal success envelope.

Example:

```bash
curl -fsS '<VPOS_BASE_URL>/api/healthz'
```

Do not assume every nested health field is a permanent third-party schema. Use it primarily for operational monitoring unless an integration contract documents specific fields.

### 4.4 Prometheus metrics

```http
GET /api/metrics
```

Purpose: expose the current in-process Prometheus-format metrics snapshot.

Content type:

```text
text/plain; version=0.0.4; charset=utf-8
```

Example:

```bash
curl -fsS '<VPOS_BASE_URL>/api/metrics'
```

A monitoring system may scrape this endpoint from an approved management network. Because operational metrics can reveal station behavior, restrict network access appropriately even though the endpoint is currently unauthenticated at application level.

## 5. Authentication model for application APIs

The current application authentication model is based on VPOS user sessions.

Protected route helpers call the VPOS authentication/permission layer and can restrict a route to one or more roles:

- `tenant`
- `manager`
- `administrator`

The session implementation uses an application session cookie. This model is intended primarily for the interactive VPOS application.

### What is not currently provided

There is no general external API contract in the current repository for:

- `Authorization: Bearer <token>` service authentication
- static third-party API keys
- OAuth client credentials
- per-integration scopes
- a versioned `/api/v1` machine-to-machine surface

If your integration requires unattended access to business data or write operations, do not automate a human login/session as a substitute for a service-authentication design. Request a dedicated integration API contract.

## 6. CSRF protection on mutations

Protected mutation routes use CSRF validation by default.

The server currently accepts the CSRF token from either of these request headers:

```text
x-csrf-token
x-xsrf-token
```

or from one of these body fields:

```text
csrfToken
csrf_token
_csrf
```

A session cookie alone is therefore insufficient for the normal protected mutation routes.

This protection is appropriate for browser/session authentication. A future machine-to-machine API should use a dedicated non-browser authentication mechanism rather than teaching third-party services to emulate browser CSRF state.

Do not infer safety or idempotency solely from the HTTP method of an internal route. Some internal GET workflows can prepare application state as part of rendering or preview behavior.

## 7. Protected business APIs are internal unless contracted

The repository contains many application routes for domains such as:

- transactions
- receipts
- customers
- products and stock
- pumps and tanks
- forecourt operations
- reports
- printing
- administrative setup
- fiscal/proxy operations

Their presence under `/api` does **not** make them a supported external API. Route names, payloads, response details, authorization rules, side effects, and workflow semantics may change with the application.

A third-party integration may use one of these routes only when the interface has been explicitly approved and documented as part of that integration.

## 8. Example: transaction query API

`GET /api/transactions` is a useful example of the current application API design.

Current allowed roles:

```text
tenant
manager
administrator
```

Current query parameters include:

| Parameter | Purpose |
| --- | --- |
| `limit` | Result limit where supported by the query service |
| `page` | Page number |
| `pageSize` | Page size |
| `status` | Include a transaction status |
| `excludeStatus` | Exclude a transaction status |
| `scope` | `all`, `non-fiscalized`, or `fiscalized` |
| `transactionId` | Find a specific transaction ID |
| `pumpNumber` or `pump` | Filter by pump number |
| `search` or `q` | General search string |
| `from` / `to` | Date/time filtering |
| `startDate` / `endDate` | Date filtering aliases supported by the current query |

Example request **using an already approved authenticated VPOS session**:

```bash
curl -fsS \
  --cookie '<approved-vpos-session-cookie>' \
  '<VPOS_BASE_URL>/api/transactions?scope=fiscalized&page=1&pageSize=50'
```

This example documents current behavior; it does not establish `/api/transactions` as a stable public third-party contract.

### Transaction POST

The same route currently accepts `POST` for receipt-print enqueueing and restricts it to `manager` and `administrator` roles. Because it is a protected mutation, normal CSRF validation applies.

This illustrates why internal route names should not be interpreted as a REST resource contract: a `POST /api/transactions` in the current application is not a generic “create transaction” endpoint.

## 9. Example: receipt route and preview semantics

`GET /api/receipts` is also an internal, session-protected application route. Current allowed roles are `tenant`, `manager`, and `administrator`.

Important query parameters include:

| Parameter | Purpose |
| --- | --- |
| `transactionId` | Select a transaction/receipt |
| `list=1` | Use receipt-list behavior |
| `preview=1` | Prepare and render preview behavior for a transaction |

When `transactionId` is supplied and `list=1` is not set, the route prepares the receipt preview before returning the receipt payload.

If `preview=1` and the station setting `print_receipt_order` is `before_fiscalization`, receipt preparation calls the pre-fiscalization receipt workflow. That workflow can create durable receipt-related state. Therefore this GET request must **not** be assumed to be read-only or safe to replay arbitrarily.

### Tanzania-specific receipt preview

For Tanzania stations, pre-fiscalization receipt preparation can persist the Tanzania receipt assignment and receipt record before fiscalization completes. The assignment is designed to be reused by subsequent preview/fiscalization attempts.

The current Tanzania sequencing model deliberately uses separate date scopes:

- `invoiceNumber` and `dailyCounter` are based on the originating transaction date in the station timezone;
- `zNumber` and `invoiceDate` are based on the first fiscalization/pre-fiscalization assignment date.

For delayed transactions those dates can differ legitimately. Integrations or reconciliation tools must not assume `(zNumber, dailyCounter)` is globally unique for a station. Current schema migration `1320_tanzania_assignment_counter_scope.sql` explicitly removes that invalid uniqueness assumption while retaining transaction, invoice-number, and global-counter uniqueness.

These details document current internal behavior; they do not make `/api/receipts` a supported third-party API.

## 10. HTTP status and error handling

Integrators should always inspect both the HTTP status and the response body.

Common classes include:

| Status | Meaning in the current API framework |
| --- | --- |
| `200` | Successful request |
| `201` | Resource/action created where used |
| `400` | Invalid request or CSRF validation failure in some route helpers |
| `401` | Authentication required/invalid |
| `403` | Authenticated but not authorized, or CSRF failure depending on route handling |
| `404` | Resource/route-level not found response where implemented |
| `500` | Unhandled/internal application error |

Do not parse human-readable error messages as machine-stable error identifiers when an `error.code` is available.

For support, record:

- HTTP method
- path and query parameters without secrets
- UTC/local timestamp with timezone
- HTTP status
- `error.code`
- `error.requestId`
- the station identifier known to the integration
- transaction/receipt ID where applicable

A `500` response may intentionally hide PostgreSQL or internal exception detail. Use `requestId` to correlate with authorized station logs instead of exposing raw database errors to clients.

## 11. Pagination and filtering

There is no single documented pagination contract covering every current internal route. `/api/transactions` supports `page`, `pageSize`, and `limit`, but other routes may differ.

A future public API should standardize pagination and return explicit pagination metadata. Until then, do not assume one route's query conventions apply to another route.

## 12. Date and time handling

VPOS is a station-local operational platform and station timezone matters to management, reporting, and fiscal sequencing.

For third-party integrations:

- transmit unambiguous timestamps where an endpoint accepts date/time input
- retain timezone/offset information when available
- do not assume the station uses UTC for business-day boundaries
- do not construct daily totals by naively truncating UTC timestamps unless the contract explicitly requires that behavior
- do not infer one fiscal date scope from another field without reading the country-specific contract

For Tanzania specifically, originating transaction date and first fiscalization/receipt-assignment date can both be authoritative for different fields on the same receipt.

Country and station timezone configuration must remain authoritative for station operations.

## 13. Retries and idempotency

The current repository does not expose a blanket idempotency-key contract for all mutations or state-preparing internal workflows.

Therefore:

- simple operational GET endpoints such as liveness/health may be retried according to normal network policy
- do not assume every internal GET is side-effect free
- do not blindly retry a write or receipt-preview workflow after a timeout
- first determine whether the prior request reached the station and whether durable state was already created

This is particularly important for transaction, receipt, fiscal, printing, pricing, and forecourt-control operations where duplicate actions can have real operational consequences.

Tanzania receipt assignments are intentionally persisted and reused for the same transaction. A retrying client should not expect or request a fresh invoice/global/daily counter allocation for each attempt.

A future public write API should define idempotency semantics explicitly.

## 14. Network and security guidance

Even public operational endpoints should normally be reachable only from the approved station or management network.

Third-party deployments should follow these principles:

- use TLS where the station deployment provides it
- do not send VPOS session cookies to unrelated systems
- do not place credentials or CSRF tokens in URLs
- do not log session cookies, passwords, private keys, fiscal credentials, or proxy secrets
- restrict monitoring access to `/api/healthz` and `/api/metrics` to trusted systems
- retain request IDs, not secrets, for troubleshooting
- avoid exposing the entire VPOS application through a public reverse proxy merely to consume one endpoint

## 15. DOMS/JPL is not a third-party HTTP API through VPOS

VPOS connects to the station DOMS/PSS using the JPL TCP integration. Third-party developers should not assume VPOS provides a transparent HTTP proxy to the underlying DOMS/JPL command set.

Forecourt operations in VPOS have station state, permissions, safety checks, persistence, reconciliation, and operational consequences. Direct DOMS access and VPOS business APIs are separate integration decisions.

Do not attempt to use internal VPOS routes to circumvent the station's approved DOMS/PSS access policy.

## 16. Fiscal and proxy integration boundary

`vpos-ftc-app` owns the station application/runtime and local receipt/fiscal preparation state. Cloud fiscal delivery and endpoint routing are owned by `vpos-proxy`.

A third-party developer integrating with fiscal services should confirm whether the intended contract belongs to:

- the station-local VPOS FTC API
- `vpos-proxy`
- a country fiscal service/device API

A local receipt-preview or assignment error can occur before a request reaches the proxy/cloud layer. Do not classify every fiscal-looking `500` as a proxy outage without correlating the station error.

Do not use a station-internal route when the authoritative contract belongs to the proxy/cloud component.

## 17. Recommended contract for future third-party business integrations

For machine-to-machine business access, the recommended direction is a dedicated versioned integration surface rather than exposing existing browser APIs directly.

A production-grade design should include:

- a versioned namespace such as `/api/integrations/v1/...`
- service credentials independent of human VPOS users
- explicit scopes/permissions per integration
- TLS and, where appropriate, mTLS or equivalent strong client authentication
- stable request and response schemas
- an OpenAPI specification
- standardized pagination/filtering
- explicit safe/idempotent method semantics
- idempotency keys for retry-sensitive mutations
- explicit rate limits
- audit records identifying the external client
- documented deprecation/version policy
- contract tests in CI

For sessionless machine authentication, CSRF should not be the primary anti-forgery mechanism; authentication and authorization must instead be designed specifically for non-browser clients.

This section is a design recommendation, not current application behavior.

## 18. Recommended endpoint stability classes

When agreeing an external integration, classify endpoints explicitly:

| Class | Meaning | Current examples |
| --- | --- | --- |
| Operational public | Intended for local health/monitoring use | `/api/livez`, `/api/readyz`, `/api/healthz`, `/api/metrics` |
| Contracted integration | Stable only when separately specified for a partner | None established globally by this repository today |
| Internal application API | Used by VPOS UI; may change with application releases | `/api/transactions`, `/api/receipts`, and most business/admin routes |
| Setup/bootstrap | Used during station commissioning; not general partner APIs | `/api/setup/...`, `/api/admin/setup/...` |

## 19. Monitoring example

A simple local monitoring sequence can distinguish process liveness from deeper readiness:

```bash
set -e

curl -fsS '<VPOS_BASE_URL>/api/livez'
curl -fsS '<VPOS_BASE_URL>/api/readyz'
curl -fsS '<VPOS_BASE_URL>/api/healthz'
```

For Prometheus, configure the approved scraper to request:

```text
<VPOS_BASE_URL>/api/metrics
```

Do not treat a successful metrics scrape as proof that fiscal or forecourt operations are healthy; use readiness/health and domain-specific alerting as appropriate.

## 20. Integration approval checklist

Before a third party consumes a VPOS business endpoint in production, the interface owner should define:

- [ ] owning component (`vpos-ftc-app`, `vpos-proxy`, or another service)
- [ ] exact endpoint and version
- [ ] authentication mechanism
- [ ] authorization/scope
- [ ] source networks allowed
- [ ] request schema
- [ ] response schema
- [ ] error codes
- [ ] whether each HTTP method is actually safe/read-only
- [ ] pagination/filtering semantics
- [ ] retry/idempotency rules
- [ ] expected request volume and rate limits
- [ ] timeout behavior
- [ ] audit requirements
- [ ] security/privacy classification of returned data
- [ ] backward-compatibility/deprecation policy
- [ ] test/staging procedure
- [ ] support and escalation contacts/process

If these items are not defined, treat the route as internal rather than an external production contract.

## 21. Related documentation

- [Technician Setup Guide](TECHNICIAN_SETUP_GUIDE.md)
- [Management Guide](MANAGEMENT_GUIDE.md)
- [Architecture](../ARCHITECTURE.md)
- [Configuration](../configuration.md)
- [Transactions and fiscalization](../domains/transactions.md)
- [Tanzania fiscalization](../domains/tanzania-fiscalization.md)
- [Forecourt and DOMS/JPL](../domains/forecourt.md)
- [Runtime and workers](../domains/runtime-workers.md)

## 22. Summary for third-party developers

Today, the safest supported external use of the station HTTP surface is operational monitoring through the explicitly unauthenticated health/metrics endpoints. Most other APIs are role-protected browser/application routes and must not be assumed to be stable machine-to-machine contracts.

In particular, do not infer REST semantics from route names or HTTP methods alone. Current internal receipt preview behavior can persist receipt/fiscal identity, and Tanzania fiscal fields intentionally use different transaction-date and fiscal-date scopes.

For a third party that needs transactions, receipts, stock, forecourt, customer, fiscal, or write access, define and implement a dedicated versioned integration contract rather than coupling the partner to the current VPOS UI APIs.
