# DOMS/JPL simulator validation runner

This pass adds a repeatable validation runner on top of the local DOMS/JPL simulator harness. The runner connects to a JPL target, performs a controlled read-only protocol rehearsal, and produces a JSON evidence bundle that can be pasted into the DOMS field-validation evidence import panel.

The runner is intended for simulator and pre-field checks. It does not replace validation against a real DOMS/PSS controller.

## Start a local simulator

```bash
npm run doms:jpl-sim -- --port 8888 --scenario full
```

## Run the validation runner

In a second terminal:

```bash
npm run doms:jpl-sim:validate -- --host 127.0.0.1 --port 8888 --scenario full --json-out ./doms-jpl-sim-evidence.json
```

To print only the field-validation import payload:

```bash
npm run doms:jpl-sim:validate -- --scenario full --evidence-only
```

## What it checks

The runner validates the parts of the protocol path that are most useful before a field visit:

- JPL socket connection and welcome frame.
- `FcLogon_req` / `FcLogon_resp` bootstrap.
- Startup unsolicited status collection.
- Forecourt status and install status reads.
- POS connection and PSS peripheral status reads.
- Fuelling point status, info, supervised transaction read, and unsupervised transaction read when the scenario includes transaction fixtures.
- Tank gauge status/data and delivery status/data when the scenario includes wetstock fixtures.
- Service-log, Back Office Record, and client-data backup reads when the scenario is not `minimal`.
- Price pole, wash, digital I/O, sensor, and vending reads when optional-module fixtures are enabled.
- Unsupported request handling returns `RejectMessage_resp` instead of a false operational acknowledgement.

The runner deliberately avoids clear/install/write commands. Transaction and delivery commands are read-only by default so it is safe to use for simulator evidence without mutating fixture buffers.

## Evidence import

The generated JSON includes `fieldValidationEvidenceImport`, shaped for the existing admin evidence import workflow:

```json
{
  "action": "import",
  "evidenceType": "jpl-simulator",
  "sourceSystem": "doms-jpl-simulator-validation-runner",
  "confirmNoPssWrite": true,
  "confirmManualValidation": true,
  "results": {},
  "checkpoints": []
}
```

Importing this evidence can satisfy simulator-side field-validation checkpoints, but it must not be used as live-controller acceptance evidence. Live DOMS/PSS testing should be recorded separately as `live-controller` evidence.

## Build compatibility fix

The simulator CLI now uses an explicit `main()` wrapper instead of top-level `await`, because the project build configuration does not enable top-level await for scanned TypeScript scripts.

## Reject-path fix

The simulator now acknowledges only an explicit whitelist of supported operational request names. Unknown `_req` messages return `RejectMessage_resp` with `RejectCode.value = "01H"`, preserving the original correlation ID. This prevents unsupported commands from appearing to succeed during validation.
