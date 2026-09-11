# VPOS FTC API wire contracts: catalog, stock, reporting, proxy, and miscellaneous APIs

**Baseline:** `vpos-ftc-app` `3058ac6bc63073556dfd3d41d7869ab181773d6c`.  
**Common envelopes:** see [COMMON_AND_AUTH.md](./COMMON_AND_AUTH.md).

## 1. Product categories

### ProductCategory

```ts
interface ProductCategory {
  id: string
  stationId: string
  code: string
  name: string
  description?: string | null
  icon?: string | null
  imagePath?: string | null
  sortOrder: number
  isActive: boolean
  productCount?: number
  createdAt?: string | null
  updatedAt?: string | null
}
```

### `GET /api/product-categories`

**Access:** tenant, manager, administrator.

Query:

```ts
interface ProductCategoryQuery {
  includeInactive?: 'true' | string
}
```

Only exact query value `true` includes inactive categories.

Success:

```ts
type ProductCategoriesResponse = SuccessEnvelope<ProductCategory[]>
```

### `POST /api/product-categories`

**Access:** administrator.

The route supports multipart/form or body fields and an optional image file:

```ts
interface CreateProductCategoryRequest {
  name: string
  code?: string | null
  description?: string | null
  icon?: string | null
  sortOrder?: number | string // invalid/missing normalizes to 0
  isActive?: boolean | string // default true; string "false" means false
  image?: File | null
  csrf_token?: string
}
```

Success is `SuccessEnvelope<ProductCategory | null>`.

Duplicate name/code is translated to HTTP `400` with message `A category with that code or name already exists`.

### `/api/product-categories/{categoryId}`

The path parameter is the category ID. GET returns `SuccessEnvelope<ProductCategory>` where the route supports GET. PATCH uses the category update fields and DELETE removes/deactivates according to the category service. New clients should preserve the exact `categoryId` path ID and not use category code as a substitute.

## 2. Stock DTOs

```ts
type StockMovementType = 'STOCK_IN' | 'STOCK_OUT'

type StockInReason = 'Delivery' | 'Transfer In' | 'Production' | 'Stock Count'

type StockOutReason =
  | 'Expired'
  | 'Damaged'
  | 'Personal Use'
  | 'Raw Material'
  | 'Other'
  | 'Transfer Out'
  | 'Waste'
  | 'Return'
  | 'Production'
  | 'Stock Count'

type StockProxyStatus = 'PENDING' | 'SENT' | 'FAILED' | 'NOT_REQUIRED'
type StockSourceType = 'MANUAL' | 'POS_TRANSACTION' | 'CSV_IMPORT'
```

### StockProductSummary

```ts
interface StockProductSummary {
  id: string
  productId: string
  productCode: string
  productName: string
  sku: string | null
  categoryCode: string | null
  categoryName: string | null
  unitOfMeasure: string
  unitCost: number
  currency: string
  availableQuantity: number
  lastMovementAt: string | null
  lastMovementType: StockMovementType | null
  lastProxyStatus: StockProxyStatus | null
  proxyPendingCount: number
  proxyFailedCount: number
}
```

### StockMovementRecord

```ts
interface StockMovementRecord {
  id: string
  productRecordId: string
  productId: string
  productCode: string
  productName: string
  sku: string | null
  categoryCode: string | null
  categoryName: string | null
  unitOfMeasure: string
  movementType: StockMovementType
  reason: string
  quantity: number
  unitCost: number | null
  documentId: string
  documentReference: string | null
  remarks: string | null
  supplierName: string | null
  supplierPin: string | null
  supplierInvoiceNumber: string | null
  effectiveAt: string
  createdByUserId: string | null
  createdByName: string
  sourceType: StockSourceType
  sourceTransactionId: string | null
  sourceAction: 'CAPTURE' | 'EDIT' | null
  proxyStatus: StockProxyStatus
  proxyResponse: unknown
  proxySentAt: string | null
  proxyError: string | null
  createdAt: string
  updatedAt: string
}
```

## 3. `GET /api/stock`

**Access:** manager, administrator.  
**Query:** none consumed by the current route.

```ts
interface StockOverview {
  products: StockProductSummary[]
  recentMovements: StockMovementRecord[]
}

type StockOverviewResponse = SuccessEnvelope<StockOverview>
```

## 4. `POST /api/stock`

**Access:** manager, administrator.

Body can be direct or under `data`:

```ts
interface CreateStockMovementRequest {
  productRecordId: string // UUID of local products row
  movementType: StockMovementType
  reason: StockInReason | StockOutReason
  quantity: number | string // >0, finite, max 999999999
  unitCost?: number | string | null // >=0, max 999999999
  effectiveAt: string // ISO datetime WITH offset
  documentReference?: string | null // max 45
  remarks?: string | null // max 500
  supplierName?: string | null // max 45
  supplierPin?: string | null // max 45
  supplierInvoiceNumber?: string | null // max 45
}
```

Additional validation:

- `effectiveAt` cannot be more than 5 minutes in the future;
- stock-in reason must be one of `StockInReason`;
- stock-out reason must be one of `StockOutReason`;
- `STOCK_OUT` requires `documentReference`;
- reason `Other` requires `remarks`.

Success uses HTTP `201`:

```ts
interface CreateStockMovementResult {
  movement: StockMovementRecord
  proxy: unknown
}

type CreateStockMovementResponse = CreatedEnvelope<CreateStockMovementResult>
```

`proxy` is the downstream stock-delivery result. If local persistence succeeds but proxy delivery throws, the route still returns the persisted movement result and a proxy object shaped like:

```json
{
  "success": false,
  "message": "downstream error text"
}
```

Invalid input returns HTTP `400` with `error.message = "Invalid stock movement payload."` and validation details.

## 5. Reports

### `GET /api/reports`

**Access:** tenant, manager, administrator.

Query:

```ts
interface ReportsQuery {
  limit?: string // positive integer; default 200; max 500
}
```

Success:

```ts
interface ReportsListData {
  rows: Array<Record<string, unknown>>
}

type ReportsListResponse = SuccessEnvelope<ReportsListData>
```

The report row is a report repository record. VPOS does not normalize it into a versioned external DTO at this route; preserve unknown fields and use the report ID/filename fields supplied by the installed package.

### `POST /api/reports`

This is a report **print enqueue** action, not a generic report-create operation.

```ts
interface PrintReportRequest {
  reportId?: string
  filename?: string // fallback alias
  data?: unknown // compatibility field; not used to select the report
  csrf_token?: string
}
```

The selected report is `reportId || filename`. Success is `SuccessEnvelope<Record<string, unknown>>` containing the print-job enqueue result.

### Report exports

`GET /api/reports/transactions.csv` returns CSV content. Treat the response as `text/csv`/download content rather than JSON. Date/filter query fields follow the reporting endpoint's current query contract; callers should preserve server-generated column headers rather than assuming the generic JSON envelope.

Other report routes (`/api/reports/{id}`, `/pending`, `/reporting`, `/summary`) return their route-specific report/query view. Where the route emits repository or aggregate objects without an explicit DTO, the wire type is `Record<string, unknown>` or `Array<Record<string, unknown>>`, not an implied `OK<report>` placeholder.

## 6. Proxy configuration

### `GET /api/proxy-config`

**Access:** manager, administrator.

Direct response, not the common envelope:

```ts
type ProxyConfig = Record<string, unknown>
```

VPOS reads station KV keys prefixed with `proxy.` and strips that prefix in the JSON response. Example:

```json
{
  "baseUrl": "https://proxy.example.local",
  "timeoutMs": 10000
}
```

The actual key set depends on installed proxy configuration.

### `POST /api/proxy-config`

**Access:** administrator.

Body:

```ts
interface ProxyConfigUpdate {
  csrf_token?: string
  [key: string]: unknown
}
```

Every body entry except `csrf_token` is persisted under station KV key `proxy.<key>`.

Direct success:

```json
{ "success": true }
```

This is intentionally an extensible key/value contract. Do not send secrets in URLs or client logs.

## 7. Asset/file responses

Endpoints that serve branding/category assets or generated exports can return binary/text/file bodies instead of JSON. Client code must inspect `Content-Type` and `Content-Disposition` before attempting JSON deserialization.

For image uploads described elsewhere in this guide, use multipart form upload where the caller supplies a `File`; the corresponding JSON fields alone cannot carry the binary object.

## 8. Configuration dictionary endpoints

Routes under `/api/config/*` return small dictionaries used by setup/UI clients. These are read-only lookup APIs. Their common response pattern is either `SuccessEnvelope<Array<Record<string, unknown>>>` or `SuccessEnvelope<Record<string, unknown>>` depending on the dictionary.

Known dictionary families include:

- setup countries;
- station statuses;
- tank statuses;
- tax types;
- units of measure;
- user roles;
- yes/no options.

These responses should be treated as data-driven lookup values: clients should render/use returned `value`/`label`-style fields rather than hard-code display text. If a specific dictionary is part of a contracted integration, freeze its exact element DTO in that integration contract.

## 9. `Record<string, unknown>` rule

Whenever this document uses `Record<string, unknown>`, that is the exact VPOS HTTP boundary at this baseline: VPOS itself does not declare a narrower object at that point. This is fundamentally different from the old placeholder notation `B<...>`/`OK<...>` because the client now knows that:

1. the outer value is a JSON object;
2. VPOS does not guarantee additional named properties at this route layer;
3. unknown properties must be preserved/ignored safely;
4. a narrower schema, if needed, belongs to the downstream report/proxy/controller component contract.
