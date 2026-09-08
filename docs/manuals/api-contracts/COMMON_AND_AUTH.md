# VPOS FTC API wire contracts: common, authentication, and operational health

**Audience:** developers integrating with an installed VPOS FTC package without repository access.  
**Baseline:** `vpos-ftc-app` `3058ac6bc63073556dfd3d41d7869ab181773d6c`.

This document describes the **wire format**: the JSON, text, headers, path parameters, and query parameters an HTTP client actually sends or receives. Field names are case-sensitive.

## 1. Type notation

- `string | null` means the property is present where shown but may be JSON `null`.
- `field?: string` means the property may be absent.
- ISO timestamps are JSON strings, normally emitted in ISO-8601 form.
- UUID fields are JSON strings containing UUIDs unless a route explicitly accepts a legacy identifier.
- `unknown` means the server deliberately accepts or emits unconstrained JSON at that position. It is not shorthand for an undocumented object.

## 2. Shared JSON response envelopes

### 2.1 SuccessEnvelope<T>

Many routes return HTTP `200` with:

```ts
interface SuccessEnvelope<T> {
  ok: true
  success: true
  data: T
}
```

Wire example:

```json
{
  "ok": true,
  "success": true,
  "data": {
    "id": "example"
  }
}
```

`data` can be `null` or omitted only when the route calls the shared helper without a value.

### 2.2 CreatedEnvelope<T>

Where a route uses the shared created helper, the body is identical to `SuccessEnvelope<T>` and the HTTP status is `201`.

### 2.3 SimpleFailure

Validation and route-level failures commonly use:

```ts
interface SimpleFailure {
  ok: false
  success: false
  error: {
    message: string
    [additionalField: string]: unknown
  }
}
```

Example:

```json
{
  "ok": false,
  "success": false,
  "error": {
    "message": "TIN is required"
  }
}
```

### 2.4 AuthFailure

Authentication/authorization failures raised through the shared server error handler use:

```ts
interface AuthFailure {
  ok: false
  success: false
  error: {
    code: "UNAUTHORIZED" | "FORBIDDEN"
    message: string
    requestId: string
  }
}
```

### 2.5 AppFailure

Application errors use:

```ts
interface AppFailure {
  ok: false
  success: false
  error: {
    code: string
    message: string
    details: unknown | null
    requestId: string
  }
}
```

Do not assume that values inside `details` are stable unless the endpoint contract below identifies them.

### 2.6 InternalError

Unhandled failures use HTTP `500`:

```ts
interface InternalError {
  ok: false
  success: false
  error: {
    code: "INTERNAL_ERROR"
    message: "Internal server error"
    details: null | {
      originalMessage: string
      pgCode?: string | null
      pgDetail?: string | null
      pgConstraint?: string | null
      pgTable?: string | null
      pgColumn?: string | null
    }
    requestId: string
  }
}
```

`details` is normally `null`. Debug details are exposed only when the installed service is explicitly configured for debug errors. Production integrations must not depend on them. Preserve `requestId` for support correlation.

## 3. Authentication/session DTOs

### 3.1 UserRole

```ts
type UserRole =
  | "administrator"
  | "manager"
  | "tenant"
  | "field_engineer"
```

Not every route permits all four roles.

### 3.2 StationSummary

```ts
interface StationSummary {
  id: string
  code: string
  name: string
  country: string
}
```

### 3.3 SessionUser

```ts
interface SessionUser {
  id: string
  stationId: string
  username: string
  email: string
  role: UserRole
  fullName?: string
  name?: string
  station: StationSummary
}
```

Passwords, password hashes, and session tokens are not part of this DTO.

## 4. `POST /api/auth/login`

**Aim:** authenticate a human VPOS user and establish the application session cookie.

**Content type:** `application/json` is recommended. HTML form callers are also supported by the application and can receive redirects.

### Request

```ts
interface LoginRequest {
  username: string // required after trim
  password: string // required
}
```

```json
{
  "username": "manager1",
  "password": "example-password"
}
```

### JSON success

HTTP `200`:

```ts
interface LoginResponseData {
  expiresAt: string
}

type LoginSuccess = SuccessEnvelope<LoginResponseData>
```

```json
{
  "ok": true,
  "success": true,
  "data": {
    "expiresAt": "2026-09-08T15:30:00.000Z"
  }
}
```

The response also establishes the session cookie through HTTP response headers. Treat that cookie as a credential.

### Expected failures

- `400` — username/password missing.
- `401` — invalid credentials.
- `403` — CSRF validation failure where the calling mode requires it.
- `500` — internal error, using `InternalError`.

For HTML form mode, the route can return HTTP `303` with a `Location` header instead of JSON.

## 5. `POST /api/auth/logout`

**Aim:** invalidate/clear the current application session.

**Request body:** no business payload is required. Send the current session cookie.

**Response:** the route clears/invalidate session state; browser/form callers can receive a redirect. JSON clients must tolerate the route's current logout acknowledgement rather than assuming a domain object.

## 6. `GET /api/auth/session`

**Aim:** resolve the current logged-in user/session context.

**Request body:** none.

### Success

HTTP `200`:

```ts
type SessionResponse = SuccessEnvelope<SessionUser | null>
```

Authenticated example:

```json
{
  "ok": true,
  "success": true,
  "data": {
    "id": "8c510534-7ce6-4590-a49e-9c286a6a8b93",
    "stationId": "3ec21997-0c3b-44bf-a492-d23607c4394b",
    "username": "manager1",
    "email": "manager@example.com",
    "role": "manager",
    "fullName": "Station Manager",
    "station": {
      "id": "3ec21997-0c3b-44bf-a492-d23607c4394b",
      "code": "SITE001",
      "name": "Example Service Station",
      "country": "TZ"
    }
  }
}
```

With no current user, `data` may be `null`.

## 7. `GET /api/security/csrf`

**Aim:** establish/read the browser CSRF token used by protected mutation routes.

### Success

This endpoint does **not** use `SuccessEnvelope<T>`.

```ts
interface CsrfResponse {
  success: true
  token: string
}
```

```json
{
  "success": true,
  "token": "opaque-csrf-token"
}
```

The server also maintains CSRF cookie state. For session-authenticated JSON mutations, send the token in `x-csrf-token` or `x-xsrf-token`, or in one of the accepted body fields `csrfToken`, `csrf_token`, or `_csrf`.

## 8. Operational health DTOs

### 8.1 HealthIntegrationComponent

JPL/Ligo/Namos/PPX components use:

```ts
type HealthIntegrationComponent =
  | {
      configured: false
      ok: true
    }
  | {
      configured: true
      ok: boolean
      data: unknown | null
    }
```

The nested `data` is the integration adapter's health payload and is intentionally adapter-specific.

### 8.2 ProxyHealthComponent

```ts
type ProxyHealthComponent =
  | {
      configured: false
      ok: true
    }
  | {
      configured: true
      ok: boolean
      status: number
    }
  | {
      configured: true
      ok: false
      error: string
    }
```

### 8.3 PrinterHealthComponent

```ts
type PrinterHealthComponent =
  | {
      configured: false
      ok: true
    }
  | {
      configured: true
      ok: boolean
      ip: string
      port: number
    }
```

### 8.4 WorkerHealthComponent

```ts
interface StaleWorker {
  processName: string
  ageMs: number
}

interface WorkerHealthComponent {
  configured: true
  ok: boolean
  required: string[]
  missing: string[]
  stale: StaleWorker[]
  maxAgeMs: number
}
```

### 8.5 Health

```ts
interface Health {
  ok: boolean
  components: {
    db: {
      ok: boolean
    }
    jpl: HealthIntegrationComponent
    ligo: HealthIntegrationComponent
    namos: HealthIntegrationComponent
    ppx: HealthIntegrationComponent
    proxyFiscalization: ProxyHealthComponent
    archiveExporters: {
      configured: false
      ok: true
      destinations: unknown[]
    }
    printer: PrinterHealthComponent
    workers: WorkerHealthComponent
  }
}
```

## 9. `GET /api/livez`

**Aim:** liveness only: prove the HTTP server is answering.

**Authentication:** none at route level.

**Response:** direct JSON, not `SuccessEnvelope<T>`.

```ts
interface LivezResponse {
  ok: true
  success: true
  status: "running"
}
```

```json
{
  "ok": true,
  "success": true,
  "status": "running"
}
```

## 10. `GET /api/readyz`

**Aim:** report whether the station runtime and required components are ready.

**Authentication:** none at route level.

```ts
type ReadyzResponse = SuccessEnvelope<Health>
```

Representative shape:

```json
{
  "ok": true,
  "success": true,
  "data": {
    "ok": true,
    "components": {
      "db": { "ok": true },
      "jpl": { "configured": true, "ok": true, "data": {} },
      "ligo": { "configured": false, "ok": true },
      "namos": { "configured": false, "ok": true },
      "ppx": { "configured": false, "ok": true },
      "proxyFiscalization": { "configured": true, "ok": true, "status": 200 },
      "archiveExporters": { "configured": false, "ok": true, "destinations": [] },
      "printer": { "configured": true, "ok": true, "ip": "192.0.2.10", "port": 9100 },
      "workers": {
        "configured": true,
        "ok": true,
        "required": ["posCommandsWorker", "printJobsWorker"],
        "missing": [],
        "stale": [],
        "maxAgeMs": 20000
      }
    }
  }
}
```

The `required` worker list can include additional installed workers such as the proxy sender.

## 11. `GET /api/healthz`

**Aim:** expose the same component health model under a `health` property.

**Authentication:** none at route level.

```ts
interface HealthzData {
  health: Health
}

type HealthzResponse = SuccessEnvelope<HealthzData>
```

Example outer shape:

```json
{
  "ok": true,
  "success": true,
  "data": {
    "health": {
      "ok": true,
      "components": {
        "db": { "ok": true }
      }
    }
  }
}
```

The complete `health` object follows `Health` above.

## 12. `GET /api/metrics`

**Aim:** Prometheus scrape endpoint.

**Authentication:** none at route level.

**Response content type:**

```text
text/plain; version=0.0.4; charset=utf-8
```

**Body:** Prometheus exposition text, for example:

```text
http_requests_total 1
```

Do not parse this endpoint as JSON.

## 13. Client implementation guidance

A client should branch first on HTTP status, then on the response content type. For JSON error responses, retain `error.code` and `error.requestId` where supplied. Do not make client correctness depend on human-readable `error.message` strings.
