# DOMS Dynamic Tank Data Governance

This pass adds a safety layer around `change_DynamicTankData_req`. The DOMS protocol allows a POS client to manually provide dynamic tank data when connected equipment cannot measure a value; the documented example is `EnteredDensity` with `DensityValue`, `ExpireDateAndTime`, `ScrollingSpeed`, and `Text`.

## Scope implemented

- Only `DtdPars.EnteredDensity` is accepted by the command builder.
- Unsupported dynamic tank data keys are rejected before a JPL envelope is sent.
- Density values are normalized to the protocol fixed-width `FC_TANK_DENSITY` style numeric string.
- Expiry timestamps must be valid 14-digit `FC_DATE_AND_TIME` values.
- Scrolling speed is normalized to `CODE1` format.
- Operator-facing text is trimmed, whitespace-normalized, and capped to 80 characters.

## Audit persistence

Every live `CHANGE_DYNAMIC_TANK_DATA` command sent through the JPL TCP command path now writes to `forecourt_jpl_dynamic_tank_data_audit` before sending the request. The audit row is then updated to `sent` or `failed` after the DOMS/PSS response path completes.

Stored audit details include:

- station and tank id
- status: `requested`, `sent`, or `failed`
- severity: `info`, `warning`, or `critical`
- requested user id and role when supplied
- business reason/source
- validation warnings
- sanitized JPL request/response JSON
- stable source hash for idempotent updates

## Admin API

A restricted administrator route was added:

`POST /api/admin/forecourt/tanks/dynamic-data`

Expected payload fields:

```json
{
  "tankId": "03",
  "densityValue": "745",
  "expireDateAndTime": "20260710120000",
  "scrollingSpeed": "00H",
  "text": "Manual density after dip sheet",
  "reason": "Gauge did not supply density"
}
```

The route injects the authenticated user id, role, station id, and `source=admin-api` into the command payload before dispatch.

## Workflow visibility

The production workflow review now includes a Dynamic Tank Data Audit panel showing recent manual density changes, warning counts, failed sends, operator role, and reason/error details.

## Remaining field work

This pass deliberately avoids allowing arbitrary `DtdPars` writes. Additional dynamic tank parameters should only be enabled after field engineers confirm their exact DOMS/PSS use case and site acceptance criteria.
