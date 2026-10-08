# Sandbox v1 — complete implemented operation inventory

**Base:** `http://127.0.0.1:3080/api` · **Swagger:** `/api/docs` · **JSON:** `/api/openapi.json`

This inventory describes **the sandbox implementation**, not every VPOS FTC production route. Operations not implemented return HTTP 501 `SANDBOX_NOT_IMPLEMENTED`. All paths below are prefixed by `/api`. JSON endpoints generally return `{ "ok": true, "success": true, "data": ... }`, except where explicitly marked *direct*. See [DATA_SHAPES.md](./DATA_SHAPES.md) and the [production wire contracts](../../manuals/API_WIRE_CONTRACTS.md).

| Methods | Path | Request | Response data and notes |
|---|---|---|---|
| GET | /livez | none | **Direct** `{ok:true,success:true,status:"running"}` |
| GET | /readyz | none | Health component object |
| GET | /healthz | none | `{health: Health}` |
| GET | /metrics | none | **Text** Prometheus exposition |
| GET | /sandbox/coverage | auth | Supported family names; *not* a per-method guarantee |
| GET | /docs | none | **HTML** Swagger UI |
| GET | /openapi.json | none | **Direct** OpenAPI JSON document |
| POST | /auth/login | `{username,password}` | `{expiresAt}` and cookie; sandbox credentials only |
| POST | /auth/logout | none | `{success:true}`; current sandbox does not invalidate mock cookie |
| GET | /auth/session | none | `SessionUser` mock identity |
| GET | /security/csrf | none | **Direct** `{success:true,token:"csrf-disabled"}` |
| GET | /customers | `q,page,pageSize` query | `{rows:Customer[],page,pageSize,total}` |
| POST | /customers | `CustomerInput` | `Customer`; TIN-based upsert |
| GET | /customers/lookup | `tin` query | `{customer:Customer|null}` |
| GET | /customers/search | `query` query | `{local:RawCustomerRow[],cloud:[]}` |
| GET | /customers/{id} | path UUID | `CustomerDetail` |
| PATCH | /customers/{id} | partial customer fields | **Raw** `RawCustomerRow`; sparse validation in sandbox |
| DELETE | /customers/{id} | `{restore?:boolean}` | `{success:true,restored:boolean}` |
| GET | /transactions | `status,search,q,page,pageSize` query | `TransactionPage`, raw snake_case rows |
| GET | /transactions/{id} | path UUID | `RawTransactionRow & {lines:[],transactionQueue:null}` or `null` |
| POST | /transactions/manual | `{pumpNumber?,posReference?,transactionDateTime?,lines:[{productId,quantity,unitPrice?}]}` | `{transactionId,totalAmount,lineCount,stockMovementIds:[],fuelSelection:null}` |
| POST | /transactions/allocate | `{transactionId,customerId}` | `RawTransactionRow`, state changes to `ALLOCATED` |
| GET | /transactions/{id}/lines | path UUID | Editable line metadata, currently empty lines and editable=true even for missing IDs |
| GET | /transactions/fuel-options | none | `{options:FuelOption[]}` |
| GET | /transactions/pre-fuel-customer | none | `{captureOrder,allocations:RawPreFuelAllocation[]}` |
| POST | /transactions/pre-fuel-customer | `{pumpNumber,nozzleNumber,customerId}` OR `{action:"cancel",allocationId}` | Raw allocation; `authorize` returns 501 |
| GET | /products | none | `ProductListItem[]` |
| POST | /products | product object, array or `{data/products}` | `{products:CreatedProductView[],sync:{ok:false,message}}` |
| GET | /product-categories | `includeInactive=true` query | `ProductCategory[]` |
| POST | /product-categories | `{name,code?,description?,icon?,sortOrder?,isActive?}` | `ProductCategory` |
| GET | /product-categories/{categoryId} | path UUID | `ProductCategory` |
| PATCH | /product-categories/{categoryId} | partial category | `ProductCategory` |
| DELETE | /product-categories/{categoryId} | none | `ProductCategory` with `isActive:false` |
| GET | /stock | none | `{products:StockProductSummary[],recentMovements:StockMovementRecord[]}` |
| POST | /stock | `StockMovementInput` direct or `{data:...}` | **201** `{movement,proxy:{success:true,sandbox:true}}` |
| GET | /reports | `limit` query | `{rows:ReportRow[]}` |
| GET | /reports/transactions.csv | none | **CSV text** columns id,pump_number,total_amount,status |
| GET | /receipts | `list=1` required | `RawReceiptRow[]`; other GET query variants return 501 |
| GET | /settings | none | **Direct** `ConsoleSettings` JSON |
| POST | /settings | arbitrary JSON or `{settings:...}` | **Direct** `{success:true}` |
| GET | /admin/settings | none | `StationSettingsRow` |
| POST | /admin/settings | supported camelCase station fields | `StationSettingsRow`, only known keys updated |
| GET | /settings/pumps | none | `{pumps:PumpSetting[],tankGroups:TankGroupOption[]}` |
| GET | /settings/tanks | none | `{tanks:TankSetting[],products:TankProductOption[],tankGroups,atgPolling}` |
| PUT | /settings/tanks/atg-polling | `{enabled?,intervalMinutes?}` | `AtgPollingSettings` |
| GET | /settings/pump-mode | none | `{availablePumps:number[],selectedPumps:number[]}` |
| POST | /settings/pump-mode | `{selectedPumps:number[]}` (alias `skipAttendantAuthFpIds`) | Updated selection |
| GET | /config/yes-no | none | `[{value,label}]` |
| GET | /config/user-roles | none | Role `{value,label}` options |
| GET | /proxy-config | none | **Direct** empty object `{}` |

## Known v1 implementation limits

- **No real integrations:** no PostgreSQL, pumps, tank gauges, fiscal authorities, printing, proxy sends or controller writes.
- **In-memory only:** changes disappear on process restart; seed transactions, products and customers are synthetic.
- **Authentication:** bearer token or simplified mock cookie; does not reproduce production RBAC, CSRF, or session invalidation.
- **Data parity:** some raw row responses contain a subset of production columns; `GET /transactions/{id}` returns `data:null` when absent.
- **Not-yet-modeled lifecycle:** pre-fuel authorization/consumption, fiscalization, receipt generation, product sync, stock quantity deductions and worker retries are not simulated.
- **Known sandbox simplifications:** `GET /stock` reports a fixed availableQuantity; manual transaction lines aren't persisted to detail-line storage; receipt listing is seeded; invoice/receipt CSV is synthetic.
- **No blanket CRUD:** a GET path does not imply matching POST, PUT, PATCH or DELETE is supported; use this table.
- **Security:** run on localhost for development; for shared environments configure credentials and secure the service behind TLS, gateway rate limiting, and network isolation.

For actual installed-package behaviour, refer to the [API Wire Contracts](../../manuals/API_WIRE_CONTRACTS.md).