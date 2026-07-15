# DOMS/JPL Wetstock Normalization

This pass expands the FTC-side DOMS/JPL wetstock adapter so tank status, inventory data, delivery status, and delivery reports are converted into stable internal objects before they reach UI, workflow review, or reconciliation code.

## Scope

The implementation covers these DOMS/JPL response families:

- `TgStatus_resp` SUBC `00H`, `01H`, and `02H` alarm/status payloads.
- `TgData_resp` inventory data items, including the protocol-defined `TankDataItemId` values (`01`-`11`, `14`-`20`, and `41`-`44`).
- `SiteDeliveryStatus_resp` SUBC `00H` and `01H` delivery status payloads.
- `TankDeliveryData_resp` delivery report payloads and their protocol clear targets.

## Normalized tank gauge alarms

`normalizeJplTankAlarmStatus` maps DOMS `TgAlarmStatus` bits into typed entries with a stable key, bit name, alarm code, label, severity, active flag, and optional alarm text/protocol ID. The normalized keys are:

- `highLevel`
- `highHighLevel`
- `lowLevel`
- `lowLowLevel`
- `highWater`
- `tankLeak`
- `tankDataMissing`
- `highHighWater`
- `ticketedDeliveryDataLost`
- `deliveryDataLost`
- `otherAlarm`

Critical alarms are used for tank conditions that should block or escalate operations, such as high-high level, low-low level, tank leak, tank data missing, and high-high water. Warning alarms are used for conditions that support operator investigation without automatically assuming the tank data is unusable.

## Normalized tank inventory data

`normalizeJplTankGaugeData` parses the tank inventory fields used by FTC UI, reconciliation, support bundles, and reporting. It preserves the raw response while exposing typed values for:

- product and water levels
- observed, standard, adjusted, delivered, and water volumes
- available room, max safe fill capacity, and shell capacity
- average, probe, and sensor temperatures
- product density, temperature-corrected density, and mass
- sludge level, oil separator values, pressure, group ID, product code, gauge type, and inflow control mode

The `TgData_req` builder now requests only protocol-defined `TankDataItemId` values by default so the adapter does not silently omit newer reporting fields such as delivered quantity and pressure.

## Normalized delivery status and reports

`normalizeJplSiteDeliveryStatus` converts DOMS delivery flags into a simple status value:

- `idle`
- `starting_marked`
- `in_progress`
- `finishing_marked`
- `data_ready`

It also derives candidate tank gauge IDs from `TgId`, `TgIds`, `TankDeliveries`, and `TankTicketedDeliveries`. When delivery data is ready, the normalized response exposes `clearCandidates` containing the tank gauge IDs and the `DeliveryReportSeqNo` needed for the eventual `clear_TankDeliveryData_req` workflow.

`normalizeJplTankDeliveryData` parses the full delivery report shape and exposes a `clearTarget` when both `TgId` and `TankDeliverySeqNo` are present. This gives the admin workflow a safe, protocol-aligned object for later clear confirmation instead of reconstructing clear payloads from raw response fields.

## Runtime state

The JPL adapter now remembers recent `TgData_resp` snapshots alongside `TgStatus_resp`, `SiteDeliveryStatus_resp`, and `TankDeliveryData_resp`. These snapshots are meant for diagnostics and workflow review, not as a replacement for persisted stock movement records.

## Remaining safety gates

Dynamic tank data mutation still requires additional validation, role policy, and audit checks before it should be treated as production-ready. Field validation against a DOMS/PSS simulator or live controller is still required for delivery lifecycle timing, clear confirmation, and unusual tank-gauge protocol variants.
