# DOMS/JPL Optional Module Runtime

This pass promotes the optional DOMS protocol families from raw log visibility to durable runtime state that can be reviewed by support without parsing JPL payloads manually.

## Covered protocol families

The implementation stores normalized snapshots and faults for:

- price poles (`PpStatus_resp`, `PpErrorMsg_resp`)
- digital I/O pins (`DiopStatus_resp`)
- sensors (`SensorStatus_resp` and active sensor alarms)
- vending machines (`VmStatus_resp`, active vending alarms, `VmErrorMsg_resp`, and `VmDrystockTotals_resp`)

The implementation remains passive for these optional modules unless an operator explicitly sends a command through the existing admin command controls. It does not automatically open/close vending machines, toggle digital outputs, reset price poles, or clear optional-device errors.

## Persistence

Migration `1230_jpl_optional_module_runtime.sql` adds three tables:

- `forecourt_jpl_optional_device_snapshots` - one latest snapshot per station/device family/device ID.
- `forecourt_jpl_optional_device_errors` - deduplicated active fault/alarm records keyed by a stable source hash.
- `forecourt_jpl_vending_totals` - captured vending totals and item counts for reconciliation.

Each snapshot keeps the source JPL message, subCode, main state, raw state code, normalized operational status, severity, online/error/alarm flags, lock/protocol identifiers where available, status JSON, flag JSON, alarm JSON, the raw payload JSON, and a stable hash.

Each error keeps the source message, error code/name/text, protocol ID, error date/time where available, severity, status, raw payload JSON, and a stable hash. Repeated observations of the same fault update the timestamp rather than creating duplicates.

## Lifecycle ingestion

`updateAdapterSnapshotState` now routes both unsolicited and solicited responses through the optional module normalizers. The explicit command path also updates snapshots after a solicited response, so support can use `READ_VM_TOTALS`, `GET_SENSOR_STATUS`, `GET_PP_STATUS`, and similar commands to refresh workflow state.

MultiMessages continue to be expanded and dispatched into the same handlers, so `ID_ZERO` status requests can update many optional-device rows in one response.

## Admin workflow visibility

The production workflow review panel now includes an **Optional DOMS module runtime** section with:

- devices seen
- warning/error device count
- open optional-device fault count
- vending totals count
- recent optional snapshots
- open optional faults
- recent vending totals

This is intended for support triage and commissioning validation. It is not a replacement for PSS Configurator or device-specific vendor tooling.

## Command coverage improvements

The vending command builders were tightened to match the protocol shape used by the PSS:

- `OPEN_VM` now includes `PosId` and `VmOperationModeNo`.
- `GET_VM_DRYSTOCK_TOTALS` / `READ_VM_TOTALS` now include `VmTotalType`, defaulting to calculated totals (`01H`).

## Field validation checklist

Use this module during commissioning to confirm:

1. Price-pole statuses update after solicited status reads and unsolicited changes.
2. Digital I/O status messages create/update snapshots without enabling automatic output changes.
3. Sensor active alarms persist as warning/error workflow rows.
4. Vending status messages update snapshots and active alarms.
5. Vending totals are captured after `READ_VM_TOTALS` for both calculated and machine totals where supported.
6. Optional-device errors persist without being automatically cleared.
7. MultiMessage status responses update all device rows correctly.
