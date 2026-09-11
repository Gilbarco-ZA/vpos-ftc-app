# VPOS FTC API wire contracts: runtime and support APIs

**Baseline:** `vpos-ftc-app` `3058ac6bc63073556dfd3d41d7869ab181773d6c`.  
**Common envelopes:** see [COMMON_AND_AUTH.md](./COMMON_AND_AUTH.md).

These endpoints are intended for administrators/support/runtime tooling. They are not a general partner-facing fiscal API.

## 1. Fiscal inbox enums and DTOs

```ts
type FiscalInboxTopic = 'fiscal' | 'pos' | 'external_fiscalization'

type FiscalInboxStatus =
  | 'PENDING'
  | 'PROCESSING'
  | 'PROCESSED'
  | 'FAILED'
  | 'DEAD'
```

### FiscalInboxListRow

```ts
interface FiscalInboxListRow {
  id: number
  stationId: string
  topic: string
  status: string
  requestId: string | null
  attemptCount: number
  nextAttemptAt: string | null
  createdAt: string | null
  processedAt: string | null
  deadAt: string | null
  resolvedAt: string | null
  errorText: string | null
  relatedTransactionId: string | null
  relatedTransactionStatus: string | null
}
```

### FiscalInboxItem

```ts
interface FiscalInboxItem {
  id: number
  stationId: string
  topic: string | null
  status: string | null
  requestId: string | null
  attemptCount: number
  nextAttemptAt: string | null
  receivedAt: string | null
  processedAt: string | null
  deadAt: string | null
  resolvedAt: string | null
  errorText: string | null
  relatedTransactionId: string | null
  relatedTransactionStatus: string | null
  message: unknown
}
```

`message` is the original durable fiscal/runtime message. Its nested schema belongs to the producer/topic and is therefore `unknown` at the generic inbox boundary.

### FiscalInboxRawDetail

The detail service also exposes the stored row in raw database naming:

```ts
interface FiscalInboxRawDetail {
  id: number
  station_id: string
  topic: FiscalInboxTopic
  request_id: string | null
  status: string
  attempt_count: number
  next_attempt_at: unknown
  received_at: unknown
  processed_at: unknown
  dead_at: unknown
  resolved_at: unknown
  error_text: string | null
  message_json: unknown
  related_transaction_id: string | null
  related_transaction_status: string | null
}
```

## 2. `GET /api/runtime/fiscal/inbox`

**Access:** administrator.

Query:

```ts
interface FiscalInboxListQuery {
  stationId?: string // defaults to authenticated station
  status?: 'ANY' | FiscalInboxStatus | string
  topic?: 'ANY' | FiscalInboxTopic | string
  limit?: string // positive integer; default 50
  offset?: string // non-negative integer; default 0
}
```

Unknown status values normalize to `ANY`. Unknown topic values normalize to `ANY`.

Success data:

```ts
interface FiscalInboxPage {
  total: number
  limit: number
  offset: number
  items: FiscalInboxListRow[]
}

type FiscalInboxListResponse = SuccessEnvelope<FiscalInboxPage>
```

## 3. `GET /api/runtime/fiscal/inbox/{id}`

**Path:** positive numeric `id`.  
**Access:** administrator.

Success:

```ts
interface FiscalInboxDetailData {
  item: FiscalInboxItem | null
  detail: FiscalInboxRawDetail
  transactionId: string | null
  transaction: Record<string, unknown> | null
  products: Array<Record<string, unknown>>
  decimals: {
    money: number
    volume: number
    unitPrice: number
  }
}

type FiscalInboxDetailResponse = SuccessEnvelope<FiscalInboxDetailData>
```

`transaction` is the transaction detail database-shaped representation. `products` is the transaction-edit catalog representation. Use the business contract document for typed transaction/product endpoints rather than depending on these support-view joins.

Invalid IDs return `400`; missing records return `404`.

## 4. `PATCH /api/runtime/fiscal/inbox/{id}`

**Access:** administrator.  
**CSRF:** explicitly disabled on this support route.

```ts
type FiscalInboxItemAction =
  | 'REQUEUE'
  | 'CLONE_REQUEUE'
  | 'MARK_DEAD'
  | 'MARK_FAILED'
  | 'MARK_PROCESSED'
  | 'DELETE'

interface FiscalInboxItemMutation {
  action: FiscalInboxItemAction
  errorText?: string | null
  requestId?: string | null
  messageJson?: Record<string, unknown> | string | null
}
```

When `messageJson` is a string it must contain valid JSON. A non-object, non-string value is rejected.

Success is `SuccessEnvelope<unknown>`, where the result is the exact command result from the requested queue transition. Because each action returns a different command DTO, clients should branch on the submitted `action` and treat the success data as action-specific.

## 5. `POST /api/runtime/fiscal/inbox/bulk`

**Access:** administrator.  
**CSRF:** explicitly disabled.

```ts
type BulkFiscalInboxAction =
  | 'REQUEUE'
  | 'MARK_FAILED'
  | 'MARK_DEAD'
  | 'MARK_PROCESSED'
  | 'DELETE'

interface BulkFiscalInboxRequest {
  ids: Array<number | string>
  action: BulkFiscalInboxAction
  stationId?: string | null
  errorText?: string | null
}
```

`ids` must be a non-empty array containing values that parse to finite numbers.

Success from the repository contract is:

```ts
type BulkFiscalInboxResponse = SuccessEnvelope<{ ok: true }>
```

## 6. `POST /api/runtime/fiscal/inbox/bulk-clone-requeue`

The bulk-clone contract is:

```ts
interface BulkCloneRequeueRequest {
  ids: Array<number | string>
  stationId?: string | null
  requestIdSuffix?: string
  override?: {
    merge?: Record<string, unknown>
    replace?: Record<string, unknown>
  }
}

interface BulkCloneRequeueResult {
  createdCount: number
  created: Array<Record<string, unknown>>
}

type BulkCloneRequeueResponse = SuccessEnvelope<BulkCloneRequeueResult>
```

`replace` supplies a complete replacement message object for the clone where supported; `merge` overlays object fields.

## 7. `POST /api/runtime/fiscal/inbox/requeue-dead`

```ts
interface RequeueDeadRequest {
  stationId?: string
  ids?: Array<number | string> | null
}

interface RequeueDeadResult {
  requeuedCount: number
  requeuedIds: number[]
}

type RequeueDeadResponse = SuccessEnvelope<RequeueDeadResult>
```

When IDs are omitted/null, the command can operate over the eligible unresolved DEAD rows for the selected station according to the application service.

## 8. `GET /api/runtime/fiscal/inbox/by-request`

This lookup selects durable inbox records by request/correlation ID.

Request query uses a request identifier and may use station context as supported by the route. Returned rows are repository records and use the generic record form:

```ts
type FiscalInboxByRequestResponse = SuccessEnvelope<
  Array<Record<string, unknown>>
>
```

Consumers should prefer `GET /api/runtime/fiscal/inbox/{id}` for normalized support-view fields after resolving an ID.

## 9. Fiscal inbox exports

The export routes operate on selected inbox row IDs and preserve stored message/metadata fields.

### JSON export

`/api/runtime/fiscal/inbox/export`

Selection accepts an `ids` array in the route's request format and returns JSON export data. Export row contents are database/export records and therefore:

```ts
type FiscalInboxExportRow = Record<string, unknown>
```

### CSV export

`/api/runtime/fiscal/inbox/export-csv`

Response is CSV download content. Do not parse it as the standard JSON envelope.

### NDJSON export

`/api/runtime/fiscal/inbox/export-ndjson`

Response is newline-delimited JSON. Each non-empty line is one exported JSON object.

## 10. `POST /api/runtime/bus/publish`

**Access:** administrator.  
**CSRF:** explicitly disabled.

This route has an exact, small HTTP-level contract:

```ts
interface RuntimeBusPublishRequest {
  topic: string
  message?: unknown
}
```

`topic` is converted to a string; `message` is deliberately unconstrained JSON because the runtime bus topic owns its nested schema.

Success is `SuccessEnvelope<RuntimeBusPublishResult>`, where the publish service result contains at least its `ok` state. A service result with `ok: false` is converted to a route failure (`Publish failed`).

## 11. Queue-operation safety

These endpoints mutate durable fiscal support state. A successful request may requeue, clone, delete, or force a terminal status. Do not retry a timed-out write until the caller has re-read the affected item(s) to determine whether the original action committed.
