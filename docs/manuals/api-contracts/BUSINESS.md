# VPOS FTC API wire contracts: business APIs

**Baseline:** `vpos-ftc-app` `3058ac6bc63073556dfd3d41d7869ab181773d6c`.  
**Common envelopes:** see [COMMON_AND_AUTH.md](./COMMON_AND_AUTH.md).

This file documents current HTTP wire formats for customer, transaction, receipt, and product APIs. These routes use the VPOS session model and are not automatically a stable public partner API; nevertheless, the shapes below describe what the installed package currently accepts and emits.

## 1. Customer DTOs

### 1.1 CustomerInput

`POST /api/customers` accepts the following JSON object. `tin` and `buyerName` are required. All other business fields are optional.

```ts
type PaymentType = "CASH" | "CARD"

interface CustomerInput {
  tin: string                 // required, 1..50; normalized uppercase
  buyerName: string           // required, 1..255; trimmed
  buyerType?: string          // max 45
  pin?: string                // max 50
  passportNumber?: string     // max 45
  businessName?: string       // max 255
  taxNinbrn?: string          // max 50
  contactPhone?: string       // max 50
  contactMobile?: string      // max 50
  contactFax?: string         // max 50
  contactEmail?: string       // max 255
  contactWebsite?: string     // max 255
  contactPerson?: string      // max 255
  addressStreet?: string      // max 255
  addressCity?: string        // max 100
  addressState?: string       // max 100
  addressProvince?: string    // max 100
  addressPostalCode?: string  // max 20
  addressCountryCode?: string // max 2; normalized uppercase
  country?: string            // max 100; normalized uppercase
  odometer?: string           // max 50
  vehicleRegNr?: string       // max 50
  paymentType?: PaymentType
}
```

Kenya-specific behavior: when the station country is `KE`, `pin` may be derived from the normalized TIN when no PIN is supplied.

Example:

```json
{
  "tin": "123456789",
  "buyerName": "Example Customer Ltd",
  "buyerType": "BUSINESS",
  "addressCity": "Dar es Salaam",
  "addressCountryCode": "TZ",
  "country": "TZ",
  "contactEmail": "accounts@example.com",
  "paymentType": "CARD"
}
```

### 1.2 CustomerPatch

`PATCH /api/customers/{id}` accepts the same business fields as `CustomerInput`, but all are optional. If `buyerName` is supplied it cannot be blank.

```ts
type CustomerPatch = Partial<CustomerInput>
```

### 1.3 Customer

Full mapped customer objects returned by create/detail/lookup use camelCase:

```ts
interface Customer {
  id: string
  tin: string
  buyerName: string
  buyerType: string | null
  pin: string | null
  passportNumber: string | null
  businessName: string | null
  taxNinbrn: string | null
  contactPhone: string | null
  contactMobile: string | null
  contactFax: string | null
  contactEmail: string | null
  contactWebsite: string | null
  contactPerson: string | null
  addressStreet: string | null
  addressCity: string | null
  addressState: string | null
  addressProvince: string | null
  addressPostalCode: string | null
  addressCountryCode: string | null
  country: string | null
  odometer: string | null
  vehicleRegNr: string | null
  paymentType: string | null
  lastStationId: string | null
  lastSeenAt: string | null
}
```

Detail responses add:

```ts
interface CustomerDetail extends Customer {
  deletedAt: string | null
  createdAt: string
  updatedAt: string
}
```

### 1.4 CustomerSummary and CustomerPage

```ts
interface CustomerSummary {
  id: string
  buyerName: string
  tin: string
  buyerType?: string | null
  contactEmail?: string | null
  contactPhone?: string | null
  contactMobile?: string | null
  country?: string | null
  odometer?: string | null
  vehicleRegNr?: string | null
  paymentType?: string | null
  lastSeenAt?: string | null
  deletedAt?: string | null
}

interface CustomerPage {
  rows: CustomerSummary[]
  page: number
  pageSize: number
  total: number
}
```

`pageSize` defaults to `20` and is clamped to `10..100`.

## 2. Customer endpoints

### 2.1 `GET /api/customers`

**Access:** tenant, manager, administrator.

Query:

```ts
interface ListCustomersQuery {
  q?: string
  country?: string
  buyerType?: string
  includeDeleted?: "true" | "1" | "yes" | string
  page?: string // parsed as number; default 1
  pageSize?: string // parsed as number; default 20
}
```

Success:

```ts
type ListCustomersResponse = SuccessEnvelope<CustomerPage>
```

Example:

```json
{
  "ok": true,
  "success": true,
  "data": {
    "rows": [
      {
        "id": "6a24477d-56bc-4659-889a-8f20d91de3ce",
        "buyerName": "Example Customer Ltd",
        "tin": "123456789",
        "buyerType": "BUSINESS",
        "contactEmail": "accounts@example.com",
        "contactPhone": null,
        "contactMobile": null,
        "country": "TZ",
        "odometer": null,
        "vehicleRegNr": null,
        "paymentType": "CARD",
        "lastSeenAt": "2026-09-08T08:00:00.000Z",
        "deletedAt": null
      }
    ],
    "page": 1,
    "pageSize": 20,
    "total": 1
  }
}
```

### 2.2 `POST /api/customers`

**Access:** tenant, manager, administrator.  
**Body:** `CustomerInput` plus the normal CSRF field/header when required.

Success:

```ts
type CreateCustomerResponse = SuccessEnvelope<Customer | null>
```

The route is an upsert-style customer workflow: a matching record may be updated rather than a second logical customer being created.

### 2.3 `GET /api/customers/{id}`

**Path:** `id: string`.

Success:

```ts
type GetCustomerResponse = SuccessEnvelope<CustomerDetail>
```

`404` is returned when no active station-visible record exists.

### 2.4 `PATCH /api/customers/{id}`

**Body:** `CustomerPatch`.

Success currently returns the updated database row from the customer repository. Most fields are snake_case in that response because the update operation returns the stored row directly. Clients that require a stable camelCase `CustomerDetail` should perform `GET /api/customers/{id}` after a successful patch.

### 2.5 `DELETE /api/customers/{id}`

This is a soft delete/restore operation.

```ts
interface DeleteCustomerRequest {
  restore?: boolean // false/omitted = delete; true = restore
}
```

Success:

```ts
interface DeleteCustomerResult {
  success: true
  restored: boolean
}

type DeleteCustomerResponse = SuccessEnvelope<DeleteCustomerResult>
```

### 2.6 `GET /api/customers/lookup`

**Access:** manager or administrator.

Query:

```ts
interface CustomerLookupQuery {
  tin: string
  station_id?: string // honored only when equal to the authenticated user's stationId
}
```

Success:

```ts
interface CustomerLookupData {
  customer: Customer | null
}

type CustomerLookupResponse = SuccessEnvelope<CustomerLookupData>
```

Missing `tin` returns HTTP `400`.

### 2.7 `GET /api/customers/search`

**Access:** tenant, manager, administrator.

Query:

```ts
interface CustomerSearchQuery {
  query: string // required
}
```

Success data:

```ts
interface CustomerSearchData {
  local: RawCustomerRow[]
  cloud: []
}
```

`local` is intentionally the current raw PostgreSQL customer row shape and therefore uses snake_case properties such as `buyer_name`, `buyer_type`, `contact_email`, `address_country_code`, `last_seen_at`, and `deleted_at`. The route is legacy-compatible; prefer `/api/customers` for a typed list DTO when possible.

`cloud` is currently always an empty array.

## 3. Transaction common DTOs

### 3.1 TransactionStatus

Current status values used by application code include:

```ts
type TransactionStatus =
  | "OPEN"
  | "ALLOCATED"
  | "PENDING"
  | "QUEUED"
  | "SENT"
  | "FISCALIZING"
  | "FISCALIZED"
  | "SUCCESS"
  | "FAILED"
  | "REJECTED"
  | "CANCELLED"
  | "PRINTED"
  | "REPRINTED"
  | "CREDITED"
```

Do not reject unknown future statuses in a forward-compatible reader solely because they are absent from this baseline.

### 3.2 TransactionListRow

`GET /api/transactions` returns **database-shaped snake_case rows**, not the camelCase `Transaction` application type.

Core properties at this baseline are:

```ts
interface TransactionListRow {
  id: string
  station_id: string
  customer_id: string | null
  pump_number: number
  transaction_date_time: string
  total_amount: number | string
  volume: number | string | null
  fuel_type: string | null
  pos_reference: string | null
  status: string
  allocated_at: string | null
  allocated_by: string | null
  fiscalization_reference: string | null
  fiscalization_response: string | null
  fiscalized_at: string | null
  linking_window_expires_at: string | null
  auto_fiscalized: boolean
  retry_count: number
  last_error: string | null
  cloud_transaction_id: string | null
  source_queue_id: string | null
  fiscal_queue_enqueued_at: string | null
  tank_id: string | null
  nozzle_id: string | null
  nozzle_number: number | null
  grade_id: string | null
  grade_name: string | null
  odometer: string | null
  payment_type: string | null
  vehicle_reg_nr: string | null
  fiscal_document_id: string | null
  doms_source_system: string | null
  doms_source_mode: string | null
  doms_fp_id: number | null
  doms_trans_seq_no: number | null
  doms_trans_lock_id: string | null
  doms_payload_json: unknown | null
  doms_payload_hash: string | null
  doms_first_seen_at: string | null
  doms_last_seen_at: string | null
  doms_cleared_at: string | null
  doms_reconciled_at: string | null
  legacy_filename: string | null
  created_at: string
  updated_at: string
  deleted_at: string | null

  // columns introduced by later runtime migrations can also be present:
  latest_fiscal_event_id?: string | null
  doms_normalized_at?: string | null
  doms_payload_cleared_at?: string | null
  doms_payload_clear_reason?: string | null
  doms_transaction_identity?: string | null
  doms_external_payment_reference?: string | null
  doms_ept_id?: string | null
  doms_ept_sequence_no?: string | null
  doms_ept_receipt_format_id?: string | null

  // list join fields:
  receipt_number: string | null
  buyer_name: string | null
  tin: string | null
  customer_buyer_name: string | null
  customer_tin: string | null
  customer_buyer_type: string | null
}
```

PostgreSQL drivers can serialize `DECIMAL` values as strings depending on runtime numeric parser configuration. Clients should accept `number | string` for money/volume values on raw database-shaped endpoints and normalize deliberately.

### 3.3 TransactionPage

```ts
interface TransactionPage {
  items: TransactionListRow[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}
```

### 3.4 TransactionLineInput

```ts
interface TransactionLineInput {
  productId: string
  quantity: number | string
  unitPrice?: number | string | null
}
```

Rules applied by the transaction service:

- `productId` must resolve to a product at the authenticated station.
- quantity must parse to a finite value greater than zero.
- a supplied unit price must be finite and non-negative.
- if `unitPrice` is missing/null/empty, the product price is used where supported.

### 3.5 FuelSelection

```ts
interface FuelSelection {
  tankId?: string
  nozzleId?: string
  nozzleNumber?: number | string | null
  gradeId?: string
  gradeName?: string
  pumpId?: string
}
```

Normalized result form:

```ts
interface FuelSelectionResult {
  tankId: string | null
  nozzleId: string | null
  nozzleNumber: number | null
  gradeId: string | null
  gradeName: string | null
}
```

## 4. Transaction endpoints

### 4.1 `GET /api/transactions`

**Access:** tenant, manager, administrator.

Query:

```ts
interface ListTransactionsQuery {
  limit?: string
  page?: string
  pageSize?: string
  status?: string
  excludeStatus?: string
  scope?: "all" | "non-fiscalized" | "fiscalized"
  transactionId?: string
  pumpNumber?: string
  pump?: string              // alias of pumpNumber
  search?: string
  q?: string                 // alias of search
  from?: string
  to?: string
  startDate?: string         // business date in station timezone
  endDate?: string           // inclusive business date in station timezone
}
```

Behavior:

- with `page` or `pageSize`, page defaults to `1`; page size defaults to `50`/`limit` and is clamped to `1..200`;
- without pagination, limit defaults to `200` and is clamped to `1..500`;
- `status` and `excludeStatus` are normalized uppercase;
- `transactionId` is a partial case-insensitive ID match;
- `search` searches transaction ID, receipt number, cloud transaction ID, fiscalization reference, fuel type, customer name/TIN, and pump number;
- `startDate`/`endDate` use the station timezone rather than naive UTC day boundaries.

Success:

```ts
type ListTransactionsResponse = SuccessEnvelope<TransactionPage>
```

Example outer response:

```json
{
  "ok": true,
  "success": true,
  "data": {
    "items": [
      {
        "id": "c32a3f20-902f-4af1-9d89-57930c79f4f6",
        "station_id": "3ec21997-0c3b-44bf-a492-d23607c4394b",
        "customer_id": "6a24477d-56bc-4659-889a-8f20d91de3ce",
        "pump_number": 2,
        "transaction_date_time": "2026-09-08T06:30:00.000Z",
        "total_amount": "65000.00",
        "volume": "23.415",
        "fuel_type": "PMS",
        "pos_reference": "ABC123",
        "status": "FISCALIZED",
        "receipt_number": "5",
        "buyer_name": "Example Customer Ltd",
        "tin": "123456789"
      }
    ],
    "total": 1,
    "page": 1,
    "pageSize": 50,
    "totalPages": 1
  }
}
```

The example omits nullable row properties for readability; `TransactionListRow` above is the client model.

### 4.2 `POST /api/transactions`

This route does **not** create a transaction. It enqueues receipt printing for an existing transaction.

**Access:** manager, administrator.

```ts
interface TransactionPrintEnqueueRequest {
  transactionId?: string
  filename?: string // legacy alias used when transactionId is absent
  data?: unknown    // accepted compatibility field; not used to select transaction
  state?: unknown   // accepted compatibility field
  csrf_token?: string
}
```

The transaction identifier is resolved as `transactionId || filename`.

Success is `SuccessEnvelope<PrintJobResult>`. The print-job DTO is documented with the printing contracts in the administration/runtime contract reference.

### 4.3 `GET /api/transactions/{id}`

**Access:** tenant, manager, administrator.

The response uses raw database naming and returns:

```ts
interface TransactionDetail extends TransactionListRow {
  // The detail SQL joins customer fields:
  buyer_name: string | null
  tin: string | null
  buyer_type: string | null

  // Child data:
  lines: RawTransactionLine[]
  transactionQueue: RawTransactionQueueRow | null
}

type GetTransactionResponse = SuccessEnvelope<TransactionDetail | null>
```

Unlike many REST APIs, a missing record can currently produce `data: null` rather than a route-level `404`.

`RawTransactionLine` and `RawTransactionQueueRow` are database-shaped objects. Use `/api/transactions/{id}/lines` when a typed editable-line DTO is required.

### 4.4 `POST /api/transactions/allocate`

**Access:** tenant, manager, administrator.

```ts
interface AllocateTransactionRequest {
  transactionId: string
  customerId: string
  tin?: string // accepted but not used by the current allocator
  odometer?: string
  paymentType?: string
  payment_type?: string // alias
  vehicleRegNr?: string
  vehicle_reg_nr?: string // alias
  csrf_token?: string
}
```

The allocator links `customerId`, records allocation metadata, and updates optional vehicle details. An `OPEN` transaction normally moves to `ALLOCATED`; other legal current states can remain unchanged while the customer link is updated.

Success is `SuccessEnvelope<RawTransactionRow | null>`, where `RawTransactionRow` uses the transaction table snake_case field set described in `TransactionListRow` excluding list-only join fields.

### 4.5 `POST /api/transactions/manual`

**Access:** tenant, manager, administrator.

```ts
interface ManualTransactionRequest {
  pumpNumber?: number | string
  posReference?: string
  transactionDateTime?: string
  lines: TransactionLineInput[]
  fuelSelection?: FuelSelection | null
  csrf_token?: string
}
```

At least one valid transaction line is required.

Success data:

```ts
interface ManualTransactionResult {
  transactionId: string
  totalAmount: number
  lineCount: number
  stockMovementIds: string[]
  fuelSelection: FuelSelectionResult | null
}

type ManualTransactionResponse = SuccessEnvelope<ManualTransactionResult>
```

### 4.6 `GET /api/transactions/fuel-options`

**Access:** tenant, manager, administrator.

```ts
interface FuelOption {
  pumpId: string | null
  pumpNumber: number
  nozzleId: string | null
  nozzleNumber: number | null
  displayNumber: number | null
  tankId: string | null
  tankName: string | null
  productRowId: string | null
  gradeId: string | null
  gradeName: string | null
  productCode: string | null
}

interface FuelOptionsData {
  options: FuelOption[]
}

type FuelOptionsResponse = SuccessEnvelope<FuelOptionsData>
```

### 4.7 `GET /api/transactions/{id}/lines`

**Access:** tenant, manager, administrator.

```ts
interface EditableTransactionLine {
  id: string
  productId: string
  quantity: number
  unitPrice: number
  lineTotal: number
  productCode: string | null
  productName: string | null
  currency: string | null
  categoryName: string | null
  isFuel: boolean
}

interface TransactionLinesData {
  lines: EditableTransactionLine[]
  editable: boolean
  fuelItemsLocked: boolean
  lockedProductIds: string[]
  excludeFuelProductsFromCatalog: boolean
  editabilityReason: string | null
  editabilityCode: string | null
  fuelSelection: FuelSelectionResult | null
}
```

Success is `SuccessEnvelope<TransactionLinesData>`.

The GET can synthesize a missing fuel line for an editable pump-recorded transaction before returning, so clients should not assume it is a completely side-effect-free metadata lookup.

### 4.8 `POST /api/transactions/{id}/lines`

```ts
interface ReplaceTransactionLinesRequest {
  lines: TransactionLineInput[]
  removedProductIds?: string[]
  fuelSelection?: FuelSelection | null
  csrf_token?: string
}

interface ReplaceTransactionLinesResult {
  success: true
  transactionId: string
  totalAmount: number
  lineCount: number
  stockMovementIds: string[]
  fuelSelection: FuelSelectionResult | null
}
```

Success: `SuccessEnvelope<ReplaceTransactionLinesResult>`.

Important `409` conflicts include application errors whose `details.code` can be:

- `PUMP_RECORDED_FUEL_ITEM_UNRESOLVED`
- `PUMP_RECORDED_FUEL_ADDITION_BLOCKED`
- `PUMP_RECORDED_FUEL_ITEM_IMMUTABLE`

### 4.9 `POST /api/transactions/{id}/fiscalize`

**Access:** manager, administrator.

```ts
interface FiscalizeTransactionRequest {
  odometer?: string
  paymentType?: string
  payment_type?: string
  vehicleRegNr?: string
  vehicle_reg_nr?: string
  customer?: {
    id?: string | null
    tin?: string | null
    buyerName?: string | null
    buyer_name?: string | null
  }
  csrf_token?: string
}
```

If `customer.id` is not supplied, the route resolves the transaction's current customer. Fiscalization without a linked customer returns HTTP `409` using an `AppFailure` with `error.code = "CONFLICT"` and `error.details.code = "CUSTOMER_LINK_REQUIRED"`.

The success data is the country fiscalization workflow result. Its nested fiscal/proxy payload is country-specific; clients should use the receipt and transaction status endpoints for a normalized cross-country representation unless their integration contract explicitly targets the fiscal engine payload.

### 4.10 `GET /api/transactions/pre-fuel-customer`

**Access:** tenant, manager, administrator.

```ts
interface PreFuelCustomerState {
  captureOrder: "before_transaction" | "after_transaction" | string
  allocations: RawPreFuelAllocation[]
}

type PreFuelCustomerStateResponse = SuccessEnvelope<PreFuelCustomerState>
```

When capture order is not `before_transaction`, `allocations` is `[]`.

### 4.11 `POST /api/transactions/pre-fuel-customer`

The route has three body variants.

Allocate:

```ts
interface AllocatePreFuelCustomerRequest {
  action?: undefined
  pumpNumber: number | string
  nozzleNumber: number | string
  nozzleId?: string
  customerId: string
}
```

`pumpNumber` and `nozzleNumber` must be positive integers.

Cancel:

```ts
interface CancelPreFuelCustomerRequest {
  action: "cancel"
  allocationId: string
}
```

Authorize:

```ts
interface AuthorizePreFuelCustomerRequest {
  action: "authorize"
  allocationId: string
}
```

All three successful variants return `SuccessEnvelope<RawPreFuelAllocation>` (or the authorization result where the authorization path augments it). Allocation rows are database-shaped and therefore use snake_case field names.

Common failures:

- `409` when station TIN capture order is configured for after-transaction capture;
- `400` for invalid pump/nozzle/customer input;
- `404` for a cancel/authorize target that no longer exists.

## 5. Receipt DTOs

### 5.1 NormalizedReceipt

```ts
interface NormalizedReceipt {
  header: {
    title: string
    stationName?: string
    stationId?: string
    companyName?: string
    companyTin?: string
    companyPin?: string
    companyVrn?: string
    companyMobile?: string
    companySerial?: string
    companyUin?: string
    companyTaxOffice?: string
    country?: string
  }
  meta: {
    receiptNumber?: string
    receiptZNumber?: string
    receiptDateTime?: string
    receiptDate?: string
    receiptTime?: string
    receiptTraNumber?: string
    pumpNumber?: string
    nozzleNumber?: string
    documentNumber?: string
    fiscalReference?: string
    attendant?: string
    scuId?: string
    cuInvoiceNo?: string
    offlinePending?: boolean
    isOfflineFiscalization?: boolean
    fiscalizationStatus?: string
  }
  buyer?: {
    name?: string
    tin?: string
    pin?: string
    buyerType?: string
    odometer?: string
    paymentType?: string
    vehicleRegNr?: string
  }
  items: Array<{
    description: string
    productCode?: string
    sku?: string
    qty?: number
    unitPrice?: number
    amount?: number
    taxType?: string
    taxRate?: number
  }>
  totals: {
    amount?: number
    tax?: number
    net?: number
    currency?: string
    discount?: number
    paymentMethod?: string
  }
  footer: {
    receiptInternalData?: string
    receiptSignature?: string
    fiscalVerificationCode?: string
    fiscalQrCodeData?: string
    copyLabel?: string
  }
  branding?: {
    logoPath?: string
    primaryColor?: string
    secondaryColor?: string
    stationDisplayName?: string
    receiptHeaderText?: string
    receiptFooterText?: string
  }
  decimals: {
    money: number
    volume: number
    unitPrice: number
  }
}
```

Decimal settings are constrained by station settings to `0..3` decimal places.

### 5.2 ReceiptPresentation

```ts
interface ReceiptPresentation {
  receiptId: string
  receiptNumber: string
  plainTextContent: string | null
  htmlContent: string | null
  renderVersion: number
  generatedAt: string | null
}
```

### 5.3 ReceiptPayload

The selected-transaction receipt endpoint is **not** wrapped in `SuccessEnvelope<T>`:

```ts
interface ReceiptPayload {
  ok: true
  receipt: NormalizedReceipt
  raw?: unknown
  voided?: boolean
  voidedAt?: string | null
  presentation?: ReceiptPresentation
}
```

`raw` contains the country fiscalization/fiscal-data payload and is deliberately `unknown` because its schema differs by country/fiscal engine.

## 6. Receipt endpoints

### 6.1 `GET /api/receipts?transactionId={id}`

**Access:** tenant, manager, administrator.

Query:

```ts
interface ReceiptQuery {
  transactionId?: string
  list?: "1" | string
  preview?: "1" | string
}
```

When `transactionId` is non-empty and `list !== "1"`, success is direct `ReceiptPayload`:

```json
{
  "ok": true,
  "receipt": {
    "header": {
      "title": "RECEIPT",
      "stationName": "Example Service Station",
      "country": "TZ"
    },
    "meta": {
      "receiptNumber": "5",
      "receiptZNumber": "20260908",
      "pumpNumber": "2"
    },
    "buyer": {
      "name": "Example Customer Ltd",
      "tin": "123456789",
      "paymentType": "CARD"
    },
    "items": [
      {
        "description": "PMS",
        "qty": 23.415,
        "unitPrice": 2775,
        "amount": 64976.625
      }
    ],
    "totals": {
      "amount": 64976.63,
      "currency": "TZS"
    },
    "footer": {
      "fiscalVerificationCode": "example-code"
    },
    "decimals": {
      "money": 2,
      "volume": 3,
      "unitPrice": 2
    }
  },
  "raw": null
}
```

The example contains illustrative values; field presence follows `NormalizedReceipt`.

Not-found response is also direct and does not use the standard failure envelope:

```ts
interface ReceiptNotFound {
  ok: false
  error: string
  raw: unknown | null
}
```

### 6.2 Receipt preview behavior

`preview=1` permits unfiscalized preview rendering. If station setting `print_receipt_order` is `before_fiscalization`, preparing the preview can persist receipt identity/state before fiscalization. Do not blindly retry it as if it were a pure read.

For Tanzania, the receipt model deliberately uses:

- invoice number + daily counter from the originating transaction date;
- Z-number + invoice date from the first fiscalization/pre-fiscalization assignment date.

### 6.3 `GET /api/receipts?list=1`

List/default mode returns:

```ts
type ReceiptListResponse = SuccessEnvelope<RawReceiptRow[]>
```

`RawReceiptRow` uses database snake_case fields. Current core fields are:

```ts
interface RawReceiptRow {
  id: string
  transaction_id: string
  station_id: string
  receipt_number: string
  html_content: string | null
  plain_text_content: string | null
  fiscal_data: unknown
  branding_snapshot: unknown | null
  generated_at: string
  cloud_receipt_id: string | null
  voided_at: string | null
  voided_by: string | null
  created_at: string
  updated_at: string
  render_version: number
}
```

If stored HTML is absent but plain text exists, the response layer can generate `html_content` from the plain text before returning the row.

## 7. Product DTOs

### 7.1 ProductSyncStatus

```ts
type ProductSyncStatus = "pending" | "synced" | "failed" | "skipped"
```

### 7.2 ProductListItem

```ts
interface ProductListItem {
  id: string
  productId: string
  productCode: string
  productName: string
  sku?: string
  unitPrice: number
  currency: string
  lastSyncStatus?: ProductSyncStatus
  lastSyncAt: string | null
}
```

### 7.3 ProductCreateInput

```ts
interface ProductCreateInput {
  productId?: string
  productCode: string
  productName: string
  productClassCode: string
  productTypeCode: string
  sku?: string                 // max 120
  barcode?: string             // max 120
  unitPrice: number | string   // coerced to number; >= 0
  unitCost: number | string    // coerced to number; >= 0
  currency: string
  taxRate?: number | string    // default 16; >= 0
  category?: string            // max 120
  categoryId?: string          // UUID
  unitOfMeasure?: string       // max 30
  unitOfPackaging?: string     // max 30
  packSize?: number | string   // integer >= 0
  taxCode: string              // 1..30
  commodityCode?: string       // max 120
  hazardousIndicator?: boolean // default false
  extProductId?: string        // max 64
  extProductCode?: string      // max 64
  extProductClassCode?: string // max 32
  extProductTypeCode?: string  // max 32
  extDescription?: string      // max 255
  extUnitOfMeasure?: string    // max 30
  extUnitOfPackaging?: string  // max 30
  extUnitPrice?: number
  extCurrency?: string         // max 8
  extTaxCode?: string          // max 32
  extHazardousIndicator?: boolean // default true
  devFlowOverride?: "offline" | "timeout" | null
}
```

### 7.4 ProductRecord

Stored product results use camelCase and include:

```ts
interface ProductRecord {
  id: string
  stationId: string
  productId: string
  productCode: string
  productName: string
  productClassCode: string
  productTypeCode: string
  sku?: string
  barcode?: string
  unitPrice: number
  unitCost: number
  currency: string
  taxRate: number
  category?: string
  categoryId?: string
  categoryIcon?: string | null
  categoryImagePath?: string | null
  unitOfMeasure?: string
  unitOfPackaging?: string
  packSize?: string
  taxCode?: string
  commodityCode?: string
  hazardousIndicator?: boolean
  devFlowOverride?: string | null
  lastSyncStatus?: ProductSyncStatus
  lastSyncAt?: string | null

  extProductId?: string
  extProductCode?: string
  extProductClassCode?: string
  extProductTypeCode?: string
  extDescription?: string
  extUnitOfMeasure?: string
  extUnitOfPackaging?: string
  extUnitPrice?: number
  extCurrency?: string
  extTaxCode?: string
  extHazardousIndicator?: boolean
  createdByName?: string
  isOnline?: boolean
}
```

## 8. Product endpoints

### 8.1 `GET /api/products`

**Access:** manager, administrator.

Success:

```ts
type ListProductsResponse = SuccessEnvelope<ProductListItem[]>
```

No catalog query filters are currently consumed by this route.

### 8.2 `POST /api/products`

**Access:** manager, administrator.

The route accepts any of these equivalent body arrangements:

Single product:

```json
{
  "productCode": "PMS",
  "productName": "Premium Motor Spirit",
  "productClassCode": "FUEL",
  "productTypeCode": "FUEL",
  "unitPrice": 2775,
  "unitCost": 2600,
  "currency": "TZS",
  "taxCode": "A"
}
```

Array:

```json
[
  {
    "productCode": "PMS",
    "productName": "Premium Motor Spirit",
    "productClassCode": "FUEL",
    "productTypeCode": "FUEL",
    "unitPrice": 2775,
    "unitCost": 2600,
    "currency": "TZS",
    "taxCode": "A"
  }
]
```

Wrapper:

```ts
interface ProductCreateWrapper {
  data?: ProductCreateInput | ProductCreateInput[]
  products?: ProductCreateInput | ProductCreateInput[]
  csrf_token?: string
}
```

If neither wrapper key is present, the whole body is interpreted as the product payload.

Success data:

```ts
interface CreatedProductView extends ProductRecord {
  lastSyncStatus: "pending"
  lastSyncAt: null
  lastSyncMessage: "Saved locally, sync queued"
}

interface CreateProductsData {
  products: CreatedProductView[]
  sync: {
    ok: false
    message: "Saved locally, sync queued"
  }
}

type CreateProductsResponse = SuccessEnvelope<CreateProductsData>
```

The returned `sync.ok: false` means synchronization has been queued/not yet confirmed; it does **not** mean the local product save failed.

Invalid product input returns HTTP `400` with:

```ts
interface InvalidProductFailure {
  ok: false
  success: false
  error: {
    message: "Invalid product payload"
    details: unknown // flattened validation details
  }
}
```

## 9. Compatibility/raw-row rule

Some older business endpoints intentionally return database-shaped objects. Whenever this document labels a DTO `Raw...Row`, preserve property names exactly as received and do not camel-case them before deciding whether the endpoint-specific consumer expects raw or normalized data.
