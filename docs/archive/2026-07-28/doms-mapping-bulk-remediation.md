# DOMS mapping bulk remediation

Bulk remediation is for field-reviewed FTC mapping corrections only. It never sends DOMS/PSS install, clear-install, or maintenance write commands.

Use it when a site has already been compared against the physical forecourt and PSS Configurator, and several FTC mapping rows need to be corrected together.

## Supported rows

Rows may be supplied as CSV or JSON through the admin reconciliation panel or the API endpoint:

```text
POST /api/admin/forecourt/reconciliation/bulk
```

CSV columns:

```csv
entityType,entityId,domsFpId,domsTankId,domsGradeOptionId,domsGradeId,sourceSuggestionCode,note
pump,<pump uuid>,1,,,,field-confirmed,Checked dispenser 1
 tank,<tank uuid>,,1,,,,Checked tank gauge 1
nozzle,<nozzle uuid>,,1,1,1,,Checked pump/nozzle grade and tank mapping
```

JSON shape:

```json
[
  {
    "entityType": "pump",
    "entityId": "<pump uuid>",
    "domsFpId": 1,
    "sourceSuggestionCode": "field-confirmed"
  },
  {
    "entityType": "nozzle",
    "entityId": "<nozzle uuid>",
    "domsGradeOptionId": 1,
    "domsGradeId": "1",
    "domsTankId": "1"
  }
]
```

## Required workflow

1. Refresh DOMS reconciliation while connected to the live controller.
2. Confirm the correction against the physical pump/tank/nozzle labels and PSS Configurator.
3. Paste CSV or JSON rows.
4. Run dry-run review.
5. Resolve blockers.
6. Apply only after the batch is marked ready.

The apply path requires all three confirmations:

- physical mapping confirmed
- live DOMS/PSS pre-validation confirmed
- bulk apply confirmed

## Pre-validation rules

Bulk dry-run blocks when:

- no rows are supplied
- rows are malformed
- the same FTC entity appears more than once in the batch
- the same DOMS FpId or TankId is assigned more than once in the batch
- the latest reconciliation snapshot has no observed controller IDs
- a pump row points to a DOMS FpId that was not observed in the latest snapshot
- reconciliation reports unresolved blocking issues

Tank IDs that have not appeared in recent wetstock payloads are warnings rather than hard blockers, because some tank gauge systems do not emit every tank during short observation windows. Field confirmation is still required.

## Audit behavior

Each applied row records the existing single-row `DOMS_MAPPING_UPDATED` audit event. The batch also records one `DOMS_MAPPING_BULK_APPLIED` audit event and a `doms.mapping_bulk_applied` forecourt event.

The safety boundary is explicit: FTC mapping fields are updated; the PSS configuration is not changed.
