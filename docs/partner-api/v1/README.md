# VPOS FTC Sandbox — Getting started (v1 initial release)

This is a standalone **synthetic** HTTP API simulator for third-party developers. It mirrors selected VPOS FTC endpoints at `/api` and does **not** contain or disclose VPOS FTC application source code.

## Links

- [Implemented endpoint inventory](./ENDPOINTS.md) — exact method/path list
- [Data shapes](./DATA_SHAPES.md) — fields, nullability, naming and response envelopes
- [Worked requests](./EXAMPLES.md) — copy/paste curl flows
- [Production API wire reference](../../manuals/API_WIRE_CONTRACTS.md) — installed production behaviour
- Swagger UI: `http://localhost:3080/api/docs`
- OpenAPI JSON: `http://localhost:3080/api/openapi.json`

## Run locally

Node.js 22 or newer is recommended (aligned with the packaged runner). From the repository root:

```bash
npm run partner:sandbox
```

The default listener is `127.0.0.1:3080`; **stop the normal FTC service first** if it already occupies port 3080. For a parallel sandbox, set `VPOS_PARTNER_SANDBOX_PORT=3095`; the URL becomes `http://localhost:3095/api`.

Use `Authorization: Bearer sandbox-token` for local calls. For example:

```bash
curl -H "Authorization: Bearer sandbox-token" \
  http://127.0.0.1:3080/api/transactions
```

Alternatively, call `POST /api/auth/login` with `{"username":"sandbox","password":"sandbox"}` and save the simulated cookie; this authentication flow is not production-grade and may differ from VPOS production login. `GET /api/security/csrf` returns `csrf-disabled` in sandbox only.

Open Swagger UI at `/api/docs`, press **Authorize**, and enter the sandbox token (without “Bearer”). The UI loads assets from `unpkg.com`, so an offline browser must be provisioned with local Swagger assets separately; the JSON specification itself is locally served.

## External testing / distribution

```bash
npm run partner:sandbox:package
cd dist/partner-sandbox
npm start
```

The minimal bundle contains `server.mjs`, `partner-api-compat.mjs`, `partner-api-swagger.mjs`, `openapi.yaml`, `README.md`, `package.json`, and `Dockerfile`. It does not include FTC's application modules or dependencies. For a shared deployment:

```bash
VPOS_PARTNER_SANDBOX_HOST=0.0.0.0 \
VPOS_PARTNER_SANDBOX_PORT=3080 \
VPOS_PARTNER_SANDBOX_TOKEN='replace-with-random-secret' \
VPOS_PARTNER_SANDBOX_PASSWORD='separate-strong-password' \
npm start
```

Place the service behind HTTPS, a reverse proxy, rate limiting and network allowlisting. Do not publish its plain HTTP port directly. Never connect this sandbox to production data, fiscal keys, PostgreSQL or pump networks. All fixture data resets when the service restarts.

## Wire behaviour and compatibility

The reference source for the *running* `/api` simulator is `/api/openapi.json`, backed by `scripts/partner-api-swagger.mjs`. The historical `openapi.yaml` is the original `/v1` normalized contract and is retained only for legacy compatibility. Do not use it to generate clients targeting `/api`.

Some endpoints return camelCase DTOs; others return snake_case PostgreSQL-shaped fields, while `/settings` is direct JSON and reports can be CSV. Do not apply automatic case conversion to every response. Status codes, fields and optional/null conventions are documented in [DATA_SHAPES.md](./DATA_SHAPES.md).

Unsupported methods return `501` with `error.code="SANDBOX_NOT_IMPLEMENTED"`. This is a **partial compatibility simulator**, not certification that every VPOS feature, validation rule or state transition is reproduced.

## First integration sequence

1. Check `GET /api/livez` and `GET /api/sandbox/coverage`.
2. Authenticate with the sandbox token.
3. Load `GET /api/transactions/fuel-options`, `GET /api/customers`, and `GET /api/transactions`.
4. Create a pre-fuel allocation or a manual transaction, then read the resulting state.
5. Exercise 400/401/404/501 cases and implement response content-type handling.
6. Use the same path prefix `/api` in production, but implement real VPOS authentication, permissions, and production-specific validation based on the installed contract and deployment policy.

## Terminology

**Station**: single site; **TIN**: customer tax ID string; **pumpNumber/nozzleNumber**: physical configured numbers; **nozzleId**: UUID; **displayNumber**: UI number; **allocation**: pre-fuel customer association; **PENDING/CONSUMED/CANCELLED**: allocation lifecycle; **transactionId**: internal transaction UUID; **posReference**: POS-originated reference; **receiptNumber**: fiscal/printing reference, not interchangeable with a transaction ID.