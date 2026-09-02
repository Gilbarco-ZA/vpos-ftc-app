# DOMS field validation release gate

This pass upgrades the DOMS field-validation workflow from a static checklist into an evidence-backed release gate.

## What changed

The `/api/admin/forecourt/field-validation` GET response now includes:

- `releaseGate`: machine-readable release status derived from the latest evidence checkpoints.
- `recentCheckpoints`: latest audit-backed validation records for the station.
- `latestCheckpointsByItem`: direct lookup of the latest checkpoint per checklist item.
- `summary.checkpointCount` and `summary.latestCheckpointAt`.

The release gate treats a production-blocking checklist item as satisfied only when its latest checkpoint status is `passed`. A pending, warning, or blocked checkpoint keeps the item in the blocker list. This keeps the release status conservative while still allowing local build/test and field evidence to be recorded after ChatGPT-generated passes are applied locally.

## Evidence imports

The existing POST route still records a single checkpoint. It now also accepts bulk evidence imports when the body contains `action: "import-evidence"`, `evidenceType`, or a `checkpoints` array.

Supported automatic import types:

```json
{
  "action": "import-evidence",
  "evidenceType": "build-test-run",
  "evidenceReference": "local-terminal-2026-07-09",
  "results": {
    "buildPassed": true,
    "testsPassed": true
  },
  "confirmNoPssWrite": true,
  "confirmManualValidation": true
}
```

```json
{
  "action": "import-evidence",
  "evidenceType": "jpl-simulator",
  "sourceSystem": "doms-simulator-lab",
  "evidenceReference": "sim-run-001",
  "results": {
    "connected": true,
    "logonPassed": true,
    "heartbeatPassed": true,
    "workflowsPassed": true
  },
  "confirmNoPssWrite": true,
  "confirmManualValidation": true
}
```

```json
{
  "action": "import-evidence",
  "evidenceType": "live-controller",
  "sourceSystem": "pss5000-site-a",
  "evidenceReference": "controller-validation-001",
  "results": {
    "connected": true,
    "logonPassed": true,
    "installStatusCaptured": true,
    "reconciliationAccepted": true,
    "workflowsPassed": true
  },
  "confirmNoPssWrite": true,
  "confirmManualValidation": true
}
```

```json
{
  "action": "import-evidence",
  "evidenceType": "tanzania-endpoint",
  "evidenceReference": "tra-ewura-validation-001",
  "results": {
    "salePassed": true,
    "creditNotePassed": true
  },
  "confirmNoPssWrite": true,
  "confirmManualValidation": true
}
```

Explicit checkpoint imports are also supported:

```json
{
  "action": "import-evidence",
  "sourceSystem": "manual-validation-sheet",
  "evidenceReference": "ops-signoff-001",
  "checkpoints": [
    {
      "checklistItemId": "local-build-completed",
      "status": "passed",
      "note": "npm run build completed locally"
    },
    {
      "checklistItemId": "test-suite-completed",
      "status": "passed",
      "note": "npm run test and JPL protocol tests completed locally"
    }
  ],
  "confirmNoPssWrite": true,
  "confirmManualValidation": true
}
```

## Safety boundary

Evidence import writes audit logs and forecourt events only. It does not:

- send DOMS/PSS commands;
- unlock, clear, or alter transaction buffers;
- alter FTC-to-DOMS mappings;
- enable maintenance PSS writes;
- switch Tanzania local/proxy fiscalization routing.

Evidence payloads are sanitized before storage. Keys that look like passwords, tokens, secrets, certificates, private keys, API keys, or bearer credentials are redacted.

## Operator workflow

1. Apply the generated pass locally.
2. Run the local build/test/simulator/live-controller validation.
3. Open **Admin > Forecourt > DOMS field validation readiness**.
4. Record a single checkpoint or paste an evidence import JSON payload.
5. Refresh the panel and review the release gate blocker list.
6. Export the readiness JSON for deployment sign-off.

The gate can become `ready-for-final-review` only when all production-blocking checklist items have a latest `passed` checkpoint.
