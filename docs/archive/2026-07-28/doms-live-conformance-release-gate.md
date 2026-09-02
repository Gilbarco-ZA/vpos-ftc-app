# DOMS live conformance release-gate import

The read-only live validator now produces release-gate checkpoints for the two remaining payload-level field validations:

- `jpl-live-fp-status-conformance-validated`
- `jpl-live-value-normalization-validated`

## Evidence flow

Run the validator with the site-specific decimal positions:

```bash
npm run doms:jpl-live:validate -- \
  --host <pss-host> \
  --port 8888 \
  --profile full-readonly \
  --money-decimals 2 \
  --volume-decimals 3 \
  --json-out ./doms-jpl-live-report.json \
  --evidence-out ./doms-jpl-live-evidence.json
```

Review `protocolConformance.findings` before importing the generated evidence. The evidence file remains a proposed import until an authenticated field engineer or administrator explicitly confirms the manual validation in the admin workflow.

The import accepts either the normal `live-controller` evidence envelope or the focused aliases `jpl-live-conformance` and `live-readonly-validation`.

## Pass conditions

The FpStatus checkpoint passes only when at least one live `FpStatus_resp` is captured and no parser-level conformance error is found.

The value-normalization checkpoint passes only when live `FpFuellingData_resp` data is captured, both decimal settings are supplied, and no numeric-format error is found.

A failed conformance result blocks the matching checkpoint. Missing evidence remains pending and is never treated as passed.

## Safety boundary

This flow does not send PSS write commands. It only imports evidence from the existing read-only validator and records audit-backed release-gate checkpoints.
