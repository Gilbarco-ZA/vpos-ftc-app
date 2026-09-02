# Product stock

**Type:** authoritative

## Scope

Product stock manages auditable stock-in and stock-out movements for products that are not assigned to the `FUEL` category. Fuel products remain under the tank inventory workflow.

## Ownership

- `app/(dashboard)/stock` owns the manager and administrator stock page.
- `app/(dashboard)/admin/products` owns product CSV import and template download.
- `app/api/stock` owns authenticated manual stock validation and response mapping.
- `app/api/products/import` owns authenticated CSV template download, import validation, product upsert, and imported stock reconciliation.
- `src/modules/stock` owns stock policy, movement orchestration, persistence, proxy payloads, and retry behavior.
- `src/modules/products` owns CSV parsing, product import validation, category resolution, and product synchronization.
- `product_inventory_movements` is the local operational ledger and source of the displayed balance.

## Movement behavior

Every stock movement is committed locally before a network request is made. Stock-in adds quantity and stock-out subtracts quantity. A product row is locked while stock-out availability is checked and the movement is inserted, preventing concurrent requests from overdrawing the same product.

Manual movements capture a local effective date and time. New forms default to the station device's current local minute and convert that instant to an offset-aware ISO timestamp before submission. They must not synthesize a fixed time for today's date. The API permits only the existing five-minute clock-skew tolerance and rejects genuinely future-dated movements.

Proxy failure does not remove or reverse a manual or CSV movement. Failed movements remain visible with their error and can be retried with the same idempotency key.

## POS transaction integration

Capturing a transaction from `/pos` creates local stock-out movements for every non-fuel transaction line in the same PostgreSQL transaction as the transaction header and lines. If any product does not have enough available stock, the entire POS capture is rejected and no transaction or inventory movement is committed.

Non-fiscalized transactions can be edited from `/transactions?status=non-fiscalized`. Local stock is reconciled against the transaction's final non-fuel quantities:

- increasing or adding a line creates only the additional stock-out quantity;
- decreasing or removing a line creates a stock-in correction;
- submitting the same final line state again creates no movement.

Transaction-generated movements are linked through `source_type = 'POS_TRANSACTION'` and `source_transaction_id`. They use `proxy_status = 'NOT_REQUIRED'` and are never sent through the stock-in or stock-out proxy endpoints. The invoice request sent through `/api/invoices` is responsible for applying sold transaction-line quantities on the cloud server, so fiscalization must not create an additional cloud stock-out.

## CSV product and stock import

Managers and administrators can download the CSV template and import up to 1,000 rows from the Products page. Header order is strict so imports remain deterministic. The `category` column accepts an existing category code or category name.

The required column order is `productId`, `productCode`, `productName`, `productClassCode`, `productTypeCode`, `unitPrice`, `unitCost`, `currency`, `taxRate`, `taxCode`, `category`, `sku`, `barcode`, `unitOfMeasure`, `unitOfPackaging`, `packSize`, `commodityCode`, `hazardousIndicator`, `stockQuantity`, and `stockUpdateMode`.

The stock columns are explicit:

- leave `stockQuantity` and `stockUpdateMode` blank to import or update only the product;
- use `stockUpdateMode = SET` to reconcile the current local balance to the supplied quantity, including reductions;
- use `stockUpdateMode = ADD` to add the supplied quantity to the current balance.

The complete CSV is parsed and validated before database changes begin. Product upserts and generated stock movements are committed in one PostgreSQL transaction. Fuel-category rows may be imported as products, but they must not contain stock values. Imported product definitions are submitted to vpos-proxy before their dependent stock movements. CSV-generated movements use `source_type = 'CSV_IMPORT'`; they remain `PENDING` if product submission is not accepted and can be sent from Product Stock after the product is synchronized. A later failed stock transmission remains retryable with the same idempotency key.

## Fuel exclusion

A product is rejected from product-stock movement handling when its normalized category code or category name equals `FUEL`, when either its local or external product class code is `FUEL`, or when its local or external product type code is a canonical fuel type such as petrol, diesel, kerosene, LPG, CNG, PMS, or AGO. The legacy category value is used only when no normalized category identity is available. This covers Tanzania catalog products that identify fuel through class/type codes even when a category has not yet been assigned. The policy is enforced by stock listing, manual movement, POS reconciliation, and CSV import paths.

## vpos-proxy transport

Only manual and CSV-imported product stock movements are sent through the existing vpos-proxy contracts. Stock-in documents use `/api/stockin`; stock-out documents use `/api/stockout`. No vpos-proxy code or endpoint changes are required for this feature.

Production endpoint resolution is:

1. `station_settings.proxy_url` and `station_settings.proxy_base_path`;
2. the persisted DOMS/JPL host with vpos-proxy port `5555`;
3. the loopback vpos-proxy default.

Environment variables are development fallbacks only and are ignored by product-stock transport when `NODE_ENV=production`.
