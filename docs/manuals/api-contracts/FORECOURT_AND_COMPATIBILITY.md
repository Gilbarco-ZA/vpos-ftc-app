# VPOS FTC API wire contracts: forecourt, DOMS/JPL, and compatibility APIs

**Baseline:** `vpos-ftc-app` `3058ac6bc63073556dfd3d41d7869ab181773d6c`.  
**Common envelopes:** see [COMMON_AND_AUTH.md](./COMMON_AND_AUTH.md).

These routes can affect live forecourt equipment. They are internal/control interfaces unless a deployment-specific integration contract explicitly exposes them.

## 1. Legacy DOMS response envelope

The `/api/pos/doms/*` family uses a legacy response format rather than `SuccessEnvelope<T>`.

Success:

```ts
interface LegacyDomsSuccess<T> {
  success: true
  message: string
  data: T
}
```

Failure:

```ts
interface LegacyDomsFailure {
  success: false
  message: string
  error: unknown
}
```

Important: the legacy failure helper defaults to HTTP `200`. A DOMS client therefore **must inspect `success`**, not only the HTTP status.

## 2. Common DOMS/JPL HTTP request conventions

All `/api/pos/doms/*` routes are `POST`, allow tenant/manager/administrator at the route layer, and explicitly disable CSRF.

The VPOS route accepts a JSON object. For the following commands the body can also be nested under `data`:

- `changeDynamicTankData`
- `getTgErrorMsg`
- `clearTankDeliveryData`
- `openTankController`
- `closeTankController`
- `startDeliveryProcess`
- `stopDeliveryProcess`
- `clearFallbackTotals`
- `markDeliveryStarting`
- `markDeliveryFinished`
- `blockTank`
- `unblockTank`
- `clearTgError`
- `resetTg`
- `changeFcDateTime`
- `changeFcOperationMode`
- `utilEcho`

For those commands these two requests are equivalent:

```json
{ "tankId": "01" }
```

```json
{ "data": { "tankId": "01" } }
```

For other commands the route forwards the body itself as the command payload.

## 3. Common selectors

The JPL adapter accepts multiple legacy/camel/Pascal aliases. Prefer the lower-camel form in new code.

```ts
interface TankSelector {
  tankId?: string | number
  TankId?: string | number
  tgId?: string | number
  TgId?: string | number
}

interface FuellingPointSelector {
  fpId?: string | number
  FpId?: string | number
  pumpId?: string | number
  pumpNumber?: string | number
}

interface PosSelector {
  posId?: string | number
  PosId?: string | number
}
```

JPL numeric IDs are generally normalized to two-character ID fields (`01`, `02`, ...). Clients should send explicit controller IDs rather than rely on implicit coercion.

## 4. `/api/pos/doms/*` request reference

### Tank control and delivery commands

| Endpoint                                    | Request body accepted by VPOS                                    | Result                       |
| ------------------------------------------- | ---------------------------------------------------------------- | ---------------------------- |
| `POST /api/pos/doms/blockTank`              | `TankSelector & Record<string, unknown>`                         | `LegacyDomsSuccess<unknown>` |
| `POST /api/pos/doms/unblockTank`            | `TankSelector & Record<string, unknown>`                         | same                         |
| `POST /api/pos/doms/clearTgError`           | `TankSelector & Record<string, unknown>`                         | same                         |
| `POST /api/pos/doms/resetTg`                | `TankSelector & Record<string, unknown>`                         | same                         |
| `POST /api/pos/doms/getTgStatus`            | `TankSelector & Record<string, unknown>`                         | same                         |
| `POST /api/pos/doms/getTgErrorMsg`          | `TankSelector & Record<string, unknown>`; direct or under `data` | same                         |
| `POST /api/pos/doms/getTankControlStatus`   | `TankSelector & Record<string, unknown>`                         | same                         |
| `POST /api/pos/doms/openTankController`     | `TankSelector & Record<string, unknown>`; direct or under `data` | same                         |
| `POST /api/pos/doms/closeTankController`    | same                                                             | same                         |
| `POST /api/pos/doms/startDeliveryProcess`   | same                                                             | same                         |
| `POST /api/pos/doms/stopDeliveryProcess`    | same                                                             | same                         |
| `POST /api/pos/doms/markDeliveryStarting`   | `TankSelector & Record<string, unknown>`; direct or under `data` | same                         |
| `POST /api/pos/doms/markDeliveryFinished`   | same                                                             | same                         |
| `POST /api/pos/doms/getAllTankDeliveryData` | `{}` or controller-supported selector/options object             | same                         |
| `POST /api/pos/doms/getAllTgData`           | `{}` or controller-supported selector/options object             | same                         |
| `POST /api/pos/doms/getSiteDeliveryStatus`  | `{}` or controller-supported options object                      | same                         |

`Record<string, unknown>` here is intentional: after VPOS normalizes known aliases, the JPL command builder owns additional controller fields. VPOS does not expose a second independent public schema for those nested JPL fields.

### `POST /api/pos/doms/clearTankDeliveryData`

Concrete VPOS-owned fields:

```ts
interface ClearTankDeliveryDataRequest {
  deliveryReportSeqNo?: string | number
  DeliveryReportSeqNo?: string | number
  posId?: string | number
  PosId?: string | number
  tankDeliveries?: TankDeliverySelector[]
  TankDeliveries?: TankDeliverySelector[]
}

interface TankDeliverySelector {
  tgId?: string | number
  TgId?: string | number
  tankDeliverySeqNo?: string | number
  TankDeliverySeqNo?: string | number
}
```

Preferred request:

```json
{
  "deliveryReportSeqNo": "12",
  "posId": "01",
  "tankDeliveries": [
    {
      "tgId": "01",
      "tankDeliverySeqNo": "34"
    }
  ]
}
```

On successful DOMS acknowledgement, VPOS also marks matching wet-stock delivery checkpoints as cleared and appends wet-stock events.

### Forecourt date/time and mode

| Endpoint                                      | Preferred VPOS request                                   | Result                       |
| --------------------------------------------- | -------------------------------------------------------- | ---------------------------- |
| `POST /api/pos/doms/getFcDateTime`            | `{}`                                                     | `LegacyDomsSuccess<unknown>` |
| `POST /api/pos/doms/changeFcDateTime`         | controller date/time fields; direct or under `data`      | same                         |
| `POST /api/pos/doms/getFcOperationModeStatus` | `{}`                                                     | same                         |
| `POST /api/pos/doms/changeFcOperationMode`    | controller operation-mode fields; direct or under `data` | same                         |

The JPL controller contract uses a forecourt date/time representation normalized by VPOS to the JPL `YYYYMMDDhhmmss`-style 14-digit field when required. Do not send locale-formatted dates.

### Price commands

#### `POST /api/pos/doms/getGradePrices`

The route accepts a JSON selector/options object and returns the controller's price-set result in `LegacyDomsSuccess.data`.

Known aliases accepted by the JPL price builder include:

```ts
interface PriceSetSelector {
  subCode?: string
  SubCode?: string
  priceSetType?: string
  PriceSetType?: string
  priceSetId?: string | number
  fcPriceSetId?: string | number
  FcPriceSetId?: string | number
  activationAt?: string
  priceSetActivationDateAndTime?: string
  PriceSetActivationDateAndTime?: string
}
```

#### `POST /api/pos/doms/changeGradePrices`

Known VPOS/JPL fields include:

```ts
interface ChangeGradePricesRequest {
  subCode?: string
  SubCode?: string
  userId?: string
  UserId?: string
  priceSetId?: string | number
  fcPriceSetId?: string | number
  FcPriceSetId?: string | number
  fcPriceGroupIds?: Array<string | number>
  FcPriceGroupId?: Array<string | number> | string | number
  fcPriceGroupId?: Array<string | number> | string | number
  fcGradeIds?: Array<string | number>
  FcGradeId?: Array<string | number> | string | number
  fcGradeId?: Array<string | number> | string | number
  fcPriceGroups?: unknown
  FcPriceGroups?: unknown
  activationAt?: string
  priceSetActivationDateAndTime?: string
  PriceSetActivationDateAndTime?: string
  [additionalJplField: string]: unknown
}
```

A successful request can also create/update VPOS pending-price-set state and append price schedule events.

#### `POST /api/pos/doms/clearPendingPriceSet`

```ts
interface ClearPendingPriceSetRequest {
  activationAt?: string
  priceSetActivationDateAndTime?: string
  PriceSetActivationDateAndTime?: string
  priceSetId?: number | string
  fcPriceSetId?: number | string
  FcPriceSetId?: number | string
}
```

Preferred form:

```json
{
  "activationAt": "20260908120000",
  "priceSetId": 123
}
```

When both activation time and price-set ID resolve successfully, VPOS deletes the corresponding local pending-price-set row and records a `removed_from_pending_queue` event after controller acknowledgement.

### Totals and diagnostic commands

| Endpoint                                     | Request body                                         | Result                              |
| -------------------------------------------- | ---------------------------------------------------- | ----------------------------------- |
| `POST /api/pos/doms/getFpGradeTotals`        | `FuellingPointSelector & Record<string, unknown>`    | legacy DOMS result                  |
| `POST /api/pos/doms/getPumpGradeTotals`      | pump/grade selector object                           | legacy DOMS result                  |
| `POST /api/pos/doms/getPumpGradeBlendTotals` | pump/grade/blend selector object                     | legacy DOMS result                  |
| `POST /api/pos/doms/getFallbackTotals`       | selector/options object or `{}`                      | legacy DOMS result                  |
| `POST /api/pos/doms/clearFallbackTotals`     | selector/context object; direct or under `data`      | legacy DOMS result                  |
| `POST /api/pos/doms/utilEcho`                | arbitrary JSON object, direct or under `data`        | echoed/controller diagnostic result |
| `POST /api/pos/doms/changeDynamicTankData`   | JPL dynamic tank data object, direct or under `data` | legacy DOMS result                  |

For these commands the exact inner JPL fields are owned by the installed DOMS/JPL protocol implementation. VPOS's HTTP contract is a JSON object plus the known aliases above; additional fields are passed to the JPL command normalizer.

## 5. POS control endpoints

All `/api/pos/control/*` routes are `POST`, allow tenant/manager/administrator, and disable CSRF.

For all non-print control commands, the HTTP body is forwarded as an unconstrained JSON object to the POS command bus:

```ts
type PosControlPayload = Record<string, unknown>
```

The command mapping is:

| HTTP endpoint                           | Internal command type    |
| --------------------------------------- | ------------------------ |
| `/api/pos/control/attendantAuth`        | `ATTENDANT_AUTH`         |
| `/api/pos/control/clearFpError`         | `CLEAR_FP_ERROR`         |
| `/api/pos/control/clearPreFuelCustomer` | `CLEAR_PREFUEL_CUSTOMER` |
| `/api/pos/control/closeFps`             | `CLOSE_FPS`              |
| `/api/pos/control/openFps`              | `OPEN_FPS`               |
| `/api/pos/control/preFuelCustomer`      | `PREFUEL_CUSTOMER`       |

Success is a direct legacy acknowledgement:

```ts
interface PosControlAck {
  message: string
}
```

Example:

```json
{
  "message": "Pos openFps message received"
}
```

A command-bus failure is raised as an application/server error rather than being returned as the acknowledgement.

`POST /api/pos/control/print` forwards the body to the POS print-job enqueue service; its body is `Record<string, unknown>` at the HTTP boundary and its result is the print enqueue result rather than `PosControlAck`.

## 6. Generic DOMS adapter: `/api/doms/{command}`

**Access:** manager, administrator.

- `GET /api/doms/{command}` reads the current/result representation for a named supported command.
- `POST /api/doms/{command}` executes a named command; CSRF is disabled.

POST body:

```ts
type GenericDomsCommandRequest = Record<string, unknown>
```

The `{command}` path segment determines the command contract. This route is a compatibility facade; use a command-specific `/api/pos/doms/*` route when one exists because it provides clearer normalization and local side-effect handling.

## 7. Generic control-plane adapter

### `POST /api/control/{module}/{command}`

**Access:** manager or administrator; managers may use module `doms`, while other modules require administrator.

**CSRF:** disabled.

Body:

```ts
type ControlCommandPayload = Record<string, unknown>
```

Unknown module/command returns `404` through the shared failure family.

Direct success shape:

```ts
interface ControlCommandResponse {
  success: boolean
  data: {
    ok?: boolean
    [field: string]: unknown
  }
}
```

`success` is computed from `Boolean(data?.ok)`.

## 8. Terminal command adapter

### `POST /api/terminal/{command}`

**Access:** administrator.  
**CSRF:** disabled.

Request body is intentionally empty/ignored:

```ts
type TerminalCommandRequest = Record<string, never>
```

The command is selected entirely by the `{command}` path segment. The response is the terminal application's command result and therefore command-specific.

## 9. Forecourt maintenance preview

### `POST /api/admin/forecourt/maintenance/preview`

**Access:** administrator.

Request:

```ts
interface MaintenancePreviewRequest {
  sessionId?: unknown
  note?: unknown
  confirmApprovedMaintenanceSession?: unknown
  confirmPreviewOnly?: unknown
  confirmNoDomsCommand?: unknown
  includeSnapshotReads?: unknown
  includeClearInstallPreviews?: unknown
  includeInstallFpPreviews?: unknown
}
```

`note`, when supplied, is normalized to a string and limited to 1000 characters. Confirmation fields that are required by the selected workflow must be literal JSON `true`.

Preview item:

```ts
type PreviewRisk = 'read-only' | 'high' | 'blocked'
type PreviewCategory =
  | 'snapshot-read'
  | 'clear-install-preview'
  | 'install-fp-preview'
  | 'manual-only'

interface MaintenanceCommandPreview {
  id: string
  category: PreviewCategory
  risk: PreviewRisk
  title: string
  description: string
  entityType?: string | null
  entityId?: string | number | null
  commandName?: string | null
  subCode?: string | null
  envelope?: Record<string, unknown> | null
  validationStatus: 'validated' | 'blocked'
  blockers: string[]
  sendsDomsCommand: false
  previewOnly: true
  safetyNote: string
}
```

The route returns direct JSON:

```ts
interface MaintenancePreviewResponse<T = unknown> {
  success: true
  data: T
}
```

The application result contains the generated preview collection plus maintenance-policy/session context. Every `MaintenanceCommandPreview` explicitly states `sendsDomsCommand: false`.

## 10. Supervisor and VPOS compatibility families

These routes are process/runtime compatibility APIs rather than business-resource APIs.

For generic command/action routes, the following rule is normative:

- if the route does not parse individual JSON properties before passing the body to a registered handler, its request DTO is `Record<string, unknown>`;
- if selection comes only from path segments (as with the terminal adapter), the request body is empty/ignored;
- the response is the registered handler's result and is typed `Record<string, unknown>` or `unknown` unless the route explicitly constructs a stable wrapper.

This is an exact statement of the VPOS HTTP boundary, not an invitation to guess protocol fields. A third party that must invoke one of these compatibility commands needs the corresponding process/DOMS/JPL integration contract in addition to this HTTP reference.

## 11. Safety and retry semantics

Forecourt commands are not blanket-idempotent. After a timeout, re-read controller/VPOS state before repeating actions such as open/close, block/unblock, delivery start/finish, price changes, clearing delivery data, or maintenance execution.
