# Sandbox v1 — request examples

All examples use `http://127.0.0.1:3080`, default sandbox token, JSON content type and synthetic IDs from the initial fixture. Start the service before running. For a shared environment, replace both the base URL and token.

## List customers

```bash
curl -sS -H 'Authorization: Bearer sandbox-token' \
  'http://127.0.0.1:3080/api/customers?page=1&pageSize=20'
```

Response (abbreviated):
```json
{"ok":true,"success":true,"data":{"rows":[{"id":"10000000-0000-4000-8000-000000000001","tin":"TIN100001","buyerName":"Sandbox Transport Ltd"}],"page":1,"pageSize":20,"total":1}}
```

## Create or update a customer

```bash
curl -sS -X POST 'http://127.0.0.1:3080/api/customers' \
  -H 'Authorization: Bearer sandbox-token' -H 'Content-Type: application/json' \
  -d '{"tin":"TEST0002","buyerName":"Sample Fleet Ltd","paymentType":"CARD"}'
```

Returns `Success<Customer>`. Reusing the same TIN updates the sandbox record.

## Create a pre-fuel allocation, then cancel it

```bash
curl -sS -X POST 'http://127.0.0.1:3080/api/transactions/pre-fuel-customer' \
  -H 'Authorization: Bearer sandbox-token' -H 'Content-Type: application/json' \
  -d '{"pumpNumber":1,"nozzleNumber":1,"customerId":"10000000-0000-4000-8000-000000000001"}'
```

Response shape (IDs/timestamps vary):
```json
{"ok":true,"success":true,"data":{"id":"<new UUID>","station_id":"00000000-0000-4000-8000-000000000001","pump_number":1,"nozzle_number":1,"customer_id":"10000000-0000-4000-8000-000000000001","status":"PENDING","transaction_id":null}}
```

Capture the `data.id`, then cancel:

```bash
curl -sS -X POST 'http://127.0.0.1:3080/api/transactions/pre-fuel-customer' \
  -H 'Authorization: Bearer sandbox-token' -H 'Content-Type: application/json' \
  -d '{"action":"cancel","allocationId":"<allocation UUID from preceding response>"}'
```

The resulting row has `status:"CANCELLED"` and a `cancelled_at` timestamp.

## Manual transaction

```bash
curl -sS -X POST 'http://127.0.0.1:3080/api/transactions/manual' \
  -H 'Authorization: Bearer sandbox-token' -H 'Content-Type: application/json' \
  -d '{"pumpNumber":1,"posReference":"TEST-POS-100","lines":[{"productId":"33000000-0000-4000-8000-000000000001","quantity":2,"unitPrice":2775}]}'
```

Response:
```json
{"ok":true,"success":true,"data":{"transactionId":"<new UUID>","totalAmount":5550,"lineCount":1,"stockMovementIds":[],"fuelSelection":null}}
```

Read it via `GET /api/transactions/{id}`. The sandbox currently does not persist child transaction line records; line GET returns an empty list.

## Products and stock

```bash
curl -sS -H 'Authorization: Bearer sandbox-token' 'http://127.0.0.1:3080/api/products'
curl -sS -X POST 'http://127.0.0.1:3080/api/stock' \
  -H 'Authorization: Bearer sandbox-token' -H 'Content-Type: application/json' \
  -d '{"productRecordId":"33000000-0000-4000-8000-000000000001","movementType":"STOCK_IN","reason":"Delivery","quantity":100,"effectiveAt":"2026-10-08T08:00:00Z"}'
```

Stock creation returns HTTP 201. Stock overview uses a fixed mock available quantity and should not be used to verify inventory accounting.

## Direct settings and CSV

```bash
curl -sS -H 'Authorization: Bearer sandbox-token' 'http://127.0.0.1:3080/api/settings'
curl -sS -H 'Authorization: Bearer sandbox-token' 'http://127.0.0.1:3080/api/reports/transactions.csv'
```

The first returns direct JSON (initially `{}`), not an envelope. The second returns `text/csv`, not JSON.

## Error and unsupported operation

```bash
curl -i -H 'Authorization: Bearer sandbox-token' 'http://127.0.0.1:3080/api/pos/doms/unknown'
```

HTTP 501:
```json
{"ok":false,"success":false,"error":{"code":"SANDBOX_NOT_IMPLEMENTED","message":"This FTC API operation is not yet simulated; no production system was contacted."}}
```
