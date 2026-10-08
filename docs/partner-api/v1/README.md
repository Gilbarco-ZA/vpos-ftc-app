# VPOS FTC Partner API v1

This is the supported integration boundary for third-party developers. It is intentionally narrower than the internal VPOS FTC `/api/*` surface.

## Contract

- OpenAPI: [openapi.yaml](./openapi.yaml)
- Version: `v1`
- JSON property names and response shapes in the OpenAPI file are stable within v1.
- Additive response fields may be introduced. Clients must ignore unknown response properties.
- Breaking request/response changes require a new major partner API version.

The installed-package wire reference remains useful when diagnosing internal VPOS behaviour, but third parties should build against this partner contract rather than database-shaped internal routes.

## Authentication

Production deployments should use a dedicated partner bearer token issued per integrator/site. Do not give third parties VPOS UI credentials, database credentials, filesystem access, source repository access, fiscal signing material, or DOMS/JPL credentials.

The local sandbox accepts `Authorization: Bearer sandbox-token`. `GET /v1/health` is unauthenticated.

## Sandbox

Run:

```bash
npm run partner:sandbox
```

Defaults:

- base URL: `http://127.0.0.1:3095/v1`
- token: `sandbox-token`
- data: synthetic, in-memory, reset whenever the process restarts
- dependencies: none outside Node.js; it does not import application modules, connect to PostgreSQL, access fiscal keys, or connect to a forecourt controller

Environment overrides:

```bash
VPOS_PARTNER_SANDBOX_HOST=0.0.0.0 \
VPOS_PARTNER_SANDBOX_PORT=3095 \
VPOS_PARTNER_SANDBOX_TOKEN=replace-me \
npm run partner:sandbox
```

Example:

```bash
curl -H 'Authorization: Bearer sandbox-token' \
  http://127.0.0.1:3095/v1/transactions/pre-fuel-customer
```


## Terminology and wire conventions

- **Partner API**: the stable, externally supported `/v1` contract. It is not synonymous with the internal FTC `/api/*` routes.
- **Station**: one VPOS site/forecourt. `stationId` is a UUID identifying that site; partner data is always station-scoped.
- **Customer**: buyer/customer identity used for transaction allocation and fiscalization. `customerId` is a UUID; `tin` is the customer's tax/customer identifier and is a string, not a numeric value.
- **Transaction**: a sale/fuel transaction. `transactionId` is a UUID. `posReference` is an external/POS reference and must not be treated as the transaction UUID.
- **Pump / nozzle**: `pumpNumber` and `nozzleNumber` are positive configured integers. `nozzleId` is the internal UUID for that nozzle. `displayNumber` is presentation-only.
- **Allocation**: association between a customer and pump/nozzle. A pre-fuel allocation exists before a matching transaction arrives.
- **Status**: lifecycle state such as `OPEN`, `FISCALIZED`, `PENDING`, or `CANCELLED`. Consumers should handle documented values and tolerate new response values where a schema is intentionally open.
- **Timestamp**: ISO-8601/RFC-3339 date-time string with timezone/offset. Do not interpret timestamps using the client machine's local timezone unless the business rule explicitly says so.
- **Money and volume**: partner v1 normalized DTOs use JSON numbers. Internal/raw FTC endpoints can expose PostgreSQL numeric values as strings; that is one reason partners should use the v1 adapter.
- **Success envelope**: successful partner responses use `{ "ok": true, "success": true, "data": ... }`, except `/health`, which is a direct health object.
- **Failure envelope**: failures use `{ "ok": false, "success": false, "error": { "code", "message", "details?" } }`. Client logic should branch on HTTP status and `error.code`, not message text.
- **Pagination**: `page` is 1-based; `pageSize` is the requested bounded page size; `total` is the number of matching rows; transaction pages also return `totalPages`.
- **Idempotency/retries**: a transport timeout does not prove a write failed. Do not automatically replay fiscal or allocation writes unless the endpoint explicitly defines idempotency. Read current state before retrying an ambiguous write.
- **Synthetic sandbox data**: sandbox UUIDs, TINs, customers, transactions, amounts, and fuel options are fictitious and reset on restart. They are safe test fixtures, not production examples to copy as identifiers.

## Supported v1 workflows

The first v1 slice covers the most common partner-read and pre-fuel integration workflows:

- health/capability check;
- list/get customers;
- create/upsert a synthetic customer in sandbox;
- list/get transactions;
- list fuel/nozzle options;
- read/create/cancel pre-fuel customer allocations.

The sandbox deliberately does not perform real fiscalization, printing, stock mutation, pump control, or receipt-number reservation. Those workflows require explicit partner contracts before they are exposed.

## Pre-fuel allocation terminology

A pre-fuel allocation means a customer is selected for a specific pump/nozzle before the forecourt transaction arrives.

- `PENDING`: waiting for a matching fuel transaction.
- `CONSUMED`: a transaction matched and consumed the allocation.
- `CANCELLED`: cancelled manually or expired.
- `pumpNumber`: physical pump number.
- `nozzleNumber`: configured nozzle number used for transaction matching.
- `displayNumber`: optional user-facing nozzle label/number.
- `allocationId`: the allocation's UUID, used by cancellation operations.
- `captureOrder`: `before_transaction` means pre-fuel allocation is active; `after_transaction` means customer capture occurs after the pump transaction.

## Isolation and deployment

For external testing, deploy the sandbox as its own container/service from a release artifact containing only:

- the sandbox runner;
- the OpenAPI file;
- synthetic fixtures/documentation.

Do not deploy the VPOS FTC source checkout to the integrator. Network policy should expose only the sandbox port and should prevent sandbox access to production PostgreSQL, VPOS internal APIs, fiscal certificate stores, and forecourt networks.

A production partner adapter should likewise sit in front of internal VPOS APIs, translate internal/raw DTOs to this stable v1 contract, and authenticate partner tokens independently of VPOS UI sessions.
