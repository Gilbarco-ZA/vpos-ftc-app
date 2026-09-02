# DOMS Phase 8 resilience evidence

This pass turns the existing JPL session-resilience self-test into importable release-gate evidence.

## Covered checkpoints

A `jpl-session-resilience` evidence import now updates four production-blocking checkpoints:

- network interruption and reconnect
- dead-connection timeout detection
- transaction recovery after reconnect
- bidirectional heartbeat handling

The importer accepts either flat result flags or the native self-test report shape where the flags are under `summary`.

## Generate evidence

```bash
npm run doms:jpl-session:selftest
```

Retain the generated JSON report and import it through the field-validation API or admin UI using:

```json
{
  "action": "import",
  "evidenceType": "jpl-session-resilience",
  "sourceSystem": "local-doms-jpl-simulator",
  "evidenceReference": "path-or-ticket-reference",
  "results": {
    "status": "passed",
    "summary": {
      "forcedDisconnectObserved": true,
      "reconnected": true,
      "deadConnectionDetected": true,
      "transactionRecoveredAfterRestart": true,
      "serverHeartbeatObserved": true,
      "clientHeartbeatObserved": true
    }
  },
  "confirmNoPssWrite": true,
  "confirmManualValidation": true
}
```

## Safety and acceptance

Simulator evidence proves deterministic client behavior and should be recorded before field work. It does not replace a controlled interruption test against the target PSS. The same checkpoint IDs can later be overwritten by newer live-controller evidence.

No PSS write command is sent by the importer or the self-test.
