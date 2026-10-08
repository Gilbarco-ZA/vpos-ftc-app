# Sandbox v1 — request and response data shapes

All names are case-sensitive. These definitions describe the **running sandbox**, including its known approximations. Unless otherwise stated, timestamp values are ISO-8601 strings, UUIDs are JSON strings, money and volume are JSON numbers in the sandbox, and nullable properties may be null.

## Common envelopes and errors

```ts
type Success<T> = { ok:true; success:true; data:T }
type Failure = { ok:false; success:false; error:{code:string;message:string} }
type Page<T> = { items:T[];total:number;page:number;pageSize:number;totalPages:number }
```

HTTP 400 indicates malformed/invalid mock inputs; 401 missing/invalid sandbox credentials; 404 missing supported entity; 501 `SANDBOX_NOT_IMPLEMENTED` for unsupported routes/actions. Do not assume every JSON endpoint has an envelope: `/settings`, `/proxy-config`, `/security/csrf`, and `/livez` are direct. `/metrics` and `/reports/transactions.csv` are text.

## Customers

```ts
interface CustomerInput {
  tin:string; buyerName:string; buyerType?:string|null; pin?:string|null;
  businessName?:string|null; contactEmail?:string|null;contactPhone?:string|null;
  addressCity?:string|null;addressCountryCode?:string|null;country?:string|null;
  odometer?:string|null;vehicleRegNr?:string|null;paymentType?:'CASH'|'CARD'|null;
}
interface Customer extends CustomerInput {
  id:string;lastStationId?:string|null;lastSeenAt?:string|null;
}
type CustomerDetail = Customer & {createdAt:string;updatedAt:string;deletedAt:string|null}
interface RawCustomerRow {
  id:string;station_id:string;last_station_id:string|null;last_seen_at:string|null;
  tin:string;buyer_name:string;is_anonymous:boolean;
  cloud_customer_id:string|null;imported_from_cloud:boolean;imported_at:string|null;
  created_at:string;updated_at:string;deleted_at:string|null;
  [otherField:string]:unknown;
}
```

`GET /customers` returns `Success<{rows:Customer[],page:number,pageSize:number,total:number}>`. Search uses `local:RawCustomerRow[]`; lookup uses `customer:Customer|null`. The sandbox's create/upsert accepts a minimally validated JSON object and preserves extra supplied fields; do not assume these unvalidated extras are production-supported.

## Transactions

```ts
interface RawTransactionRow {
  id:string;station_id:string;customer_id:string|null;pump_number:number;
  transaction_date_time:string;total_amount:number;volume:number|null;
  fuel_type:string|null;pos_reference:string|null;status:string;
  receipt_number:string|null;buyer_name:string|null;tin:string|null;
  created_at:string;updated_at:string;deleted_at:string|null;
  [otherField:string]:unknown;
}
interface ManualTransactionRequest {
  pumpNumber?:number; posReference?:string;transactionDateTime?:string;
  lines:Array<{productId:string;quantity:number|string;unitPrice?:number|string|null}>;
}
interface ManualTransactionResult {
  transactionId:string;totalAmount:number;lineCount:number;
  stockMovementIds:string[];fuelSelection:null;
}
```

`GET /transactions` returns `Success<Page<RawTransactionRow>>`. Its search supports status, search/q and paging. `POST /transactions/allocate` returns `Success<RawTransactionRow>`; `GET /transactions/{id}/lines` returns `Success<{lines:[],editable:true,fuelItemsLocked:false,lockedProductIds:[],excludeFuelProductsFromCatalog:false,editabilityReason:null,editabilityCode:null,fuelSelection:null}>`.

## Forecourt / pre-fuel allocations

```ts
type PreFuelStatus='PENDING'|'CONSUMED'|'CANCELLED';
interface RawPreFuelAllocation {
  id:string;station_id:string;pump_number:number;nozzle_id:string|null;
  nozzle_number:number;display_number:number|null;customer_id:string;
  allocated_by:string|null;status:PreFuelStatus;transaction_id:string|null;
  consumed_at:string|null;cancelled_at:string|null;created_at:string;
  updated_at:string;buyer_name:string|null;tin:string|null;
}
interface FuelOption {
  pumpId:string|null;pumpNumber:number;nozzleId:string|null;
  nozzleNumber:number|null;displayNumber:number|null;tankId:string|null;
  tankName:string|null;productRowId:string|null;gradeId:string|null;
  gradeName:string|null;productCode:string|null;
}
```

The sandbox returns snake_case raw allocations even though input fields are camelCase. `GET /transactions/pre-fuel-customer` returns `Success<{captureOrder:'before_transaction'|'after_transaction',allocations:RawPreFuelAllocation[]}>`. A second allocation for the same pump/nozzle updates the existing pending allocation. `POST` with `{action:'cancel',allocationId}` sets `status='CANCELLED'`. `{action:'authorize'}` is unsupported (501).

## Products and categories

```ts
interface ProductListItem {
  id:string;productId:string;productCode:string;productName:string;
  sku?:string|null;unitPrice:number;currency:string;
  lastSyncStatus?:string;lastSyncAt?:string|null;
}
interface CreateProductInput {
  productCode:string;productName:string;productClassCode?:string;
  productTypeCode?:string;unitPrice?:number;unitCost?:number;
  currency?:string;taxCode?:string;[otherField:string]:unknown;
}
interface ProductCategory {
  id:string;stationId:string;code:string;name:string;
  description:string|null;icon:string|null;imagePath:string|null;
  sortOrder:number;isActive:boolean;productCount:number;
  createdAt:string;updatedAt:string;
}
```

Product POST accepts one object, an array, or a `data`/`products` wrapper. It returns `Success<{products:Array<CreateProductInput & {id:string;stationId:string;productId:string;lastSyncStatus:'pending';lastSyncAt:null;lastSyncMessage:string}>,sync:{ok:false,message:string}}>`. The sync object is **not a failed local save**.

## Stock, receipts and reports

```ts
interface StockMovementInput {
  productRecordId:string;movementType:'STOCK_IN'|'STOCK_OUT';reason?:string;
  quantity:number|string;unitCost?:number|string|null;effectiveAt?:string;
  documentReference?:string;remarks?:string;supplierName?:string;
  supplierPin?:string;supplierInvoiceNumber?:string;
}
interface StockOverview {
  products:Array<{id:string;productId:string;productCode:string;
    productName:string;availableQuantity:number;currency:string;
    unitCost:number;[otherField:string]:unknown}>;
  recentMovements:Array<Record<string,unknown>>;
}
interface RawReceiptRow {
  id:string;transaction_id:string;station_id:string;receipt_number:string;
  html_content:string|null;plain_text_content:string|null;
  fiscal_data:unknown;branding_snapshot:unknown|null;generated_at:string;
  cloud_receipt_id:string|null;voided_at:string|null;voided_by:string|null;
  created_at:string;updated_at:string;render_version:number;
}
interface ReportRow {
  id:string;station_id:string;report_type:string;status:string;
  payload:unknown;report_date_time:string;created_at:string;updated_at:string;
}
```

Stock creation returns HTTP 201 and `Success<{movement:Record<string,unknown>,proxy:{success:true,sandbox:true}}>`. `/reports` wraps `{rows:ReportRow[]}`. `/receipts?list=1` returns seeded `RawReceiptRow[]`. CSV endpoint is plain text, with headers `id,pump_number,total_amount,status`.

## Settings, pumps, tanks and dictionaries

```ts
interface StationSettingsRow {
  station_id:string;linking_window_seconds:number;
  unallocated_handling:string;fiscalization_engine:string;
  fiscalization_transport:string;auto_fiscalize_enabled:boolean;
  auto_print_receipts:boolean;print_receipt_order:string;
  tin_capture_order:'before_transaction'|'after_transaction';
  sync_enabled:boolean;sync_time:string|null;sync_timezone:string|null;
  money_decimals:number;unit_price_decimals:number;volume_decimals:number;
  created_at:string;updated_at:string;
}
interface PumpSetting {
  id:string;code:string;name:string;status:string;
  hasNozzleSelector:boolean;pumpNumber:number;tankGroupId:string;tankGroupName:string;
}
interface AtgPollingSettings {enabled:boolean;intervalMinutes:number}
interface PumpMode {availablePumps:number[];selectedPumps:number[]}
interface DictionaryItem {value:string;label:string}
```

The complete tank response exposes capacity, tank/product metadata, volume and gauge fields; use `GET /settings/tanks` and the [settings wire reference](../../manuals/api-contracts/SETTINGS_SETUP_ADMIN.md) for every named field. `POST /admin/settings` maps camelCase names to the existing snake_case fields; unknown settings are ignored. `GET /settings` returns a direct arbitrary JSON object. `GET /proxy-config` returns a direct empty object.