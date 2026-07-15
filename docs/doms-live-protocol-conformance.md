# DOMS live protocol conformance capture

The live read-only validator now records the actual read/status response envelopes used by each validation step and produces a `protocolConformance` section in its JSON report.

The conformance assessment verifies two field-gated areas that cannot be proven from simulator fixtures alone:

- `FpStatus_resp` contains the required identity, main-state, and sub-state fields and can be normalized by the FTC parser.
- `FpFuellingData_resp` money and volume values are digit-only JPL numeric strings and scale correctly with the site's configured decimal positions.

Run a controlled live read-only capture with explicit site decimal settings:

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

The report exposes:

- `protocolConformance.summary.fpStatusParserValidated`
- `protocolConformance.summary.valueNormalizationValidated`
- normalized per-pump status snapshots
- raw and scaled money/volume observations
- field-level findings explaining missing properties, non-numeric values, or absent decimal configuration

A passing report is still evidence for field review, not automatic deployment approval. The operator must verify that the decimal positions match the target PSS/site configuration and import the generated evidence through the existing field-validation workflow.
