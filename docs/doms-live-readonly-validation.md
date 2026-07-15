# DOMS/JPL live read-only validation

This pass adds a field-safe validation runner for first live DOMS/PSS acceptance. It connects to a configured DOMS/JPL endpoint, logs on, collects startup unsolicited messages, and sends only read/status requests. The output is a full JSON report plus an evidence payload that can be imported into the existing field-validation release gate.

## Why this exists

The simulator harness proves the FTC JPL client can handle framing, logon, rejects, unsolicited startup traffic, and protocol-family responses. Field acceptance still needs evidence from a real controller. The live read-only runner bridges that gap without exercising transaction clears, pump authorization, maintenance writes, price changes, dynamic tank-data writes, resets, or install/clear-install commands.

## CLI usage

```bash
npm run doms:jpl-live:validate -- \
  --host 192.168.1.50 \
  --port 8888 \
  --profile full-readonly \
  --json-out ./doms-jpl-live-report.json \
  --evidence-out ./doms-jpl-live-evidence.json
```

For TLS targets:

```bash
npm run doms:jpl-live:validate -- \
  --host 192.168.1.50 \
  --port 8889 \
  --secure \
  --reject-unauthorized \
  --profile minimal-readonly
```

The generated `doms-jpl-live-evidence.json` can be pasted into the admin field-validation evidence import form.

The runner serializes requests. It prefers an exact `correlationId` match, but
also accepts a solicited response with the expected response name when the
controller omits `correlationId`. A response carrying a different correlation
ID is never accepted, and unsolicited messages are never used as request
responses. The report records how many uncorrelated-response fallbacks were
required.

## Profiles

| Profile             | Scope                                                                                                                          |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `minimal-readonly`  | JPL welcome, `FcLogon`, `FcStatus`, `FcInstallStatus`, controller date/time, POS connection status, and PSS peripheral status. |
| `dispense-readonly` | Minimal checks plus fuelling-point status, info, fuelling data, and error read checks.                                         |
| `wetstock-readonly` | Minimal checks plus tank gauge status/data, tank controller status, and site delivery status.                                  |
| `optional-readonly` | Minimal checks plus price-pole, wash, digital I/O, sensor, and vending status reads.                                           |
| `full-readonly`     | All read-only checks above.                                                                                                    |

## Safety boundary

The runner deliberately excludes:

- supervised and unsupervised transaction-buffer reads, because these can participate in POS lock semantics;
- all clear/unlock requests;
- pump authorization, open, close, stop, estop, and reset commands;
- price-bank changes and pending price clears;
- dynamic tank-data writes;
- tank block/unblock, delivery mark/clear, and gauge reset/clear commands;
- PSS installation and clear-install commands;
- wash/vending/device resets and clears.

The optional `--include-reject-probe` flag sends one intentionally unsupported request so field engineers can verify `RejectMessage_resp` handling. Leave it off unless the site team approves that diagnostic probe.

## Admin API

Administrators can run the same validation through:

```http
POST /api/admin/forecourt/field-validation/live-readonly
```

Example body:

```json
{
  "useConfiguredTarget": true,
  "profile": "minimal-readonly",
  "timeoutMs": 3000,
  "idleCollectMs": 250,
  "includeRejectProbe": false
}
```

The route uses the configured station JPL host, port, TLS flag, access code, country code, and POS version ID unless explicit overrides are supplied.

## Evidence import

The report includes `fieldValidationEvidenceImport` with:

- `evidenceType: "live-controller"`
- `confirmNoPssWrite: true`
- live connection/logon result
- install-status capture result
- read-only workflow result
- safety boundary flags
- read-only command names

Importing this evidence updates the existing release-gate checkpoint state for live connection, install-status capture, and production workflow exercise.

Generated evidence does not assert human approval. `confirmManualValidation`
is emitted as `false`; an operator must review the report and explicitly
confirm it before release-gate import.

## Bootstrap diagnostics

The JSON report separates transport and session state:

- TCP/TLS connection established;
- JPL welcome received and reported JPL version;
- parsed frame/message counts and framing errors;
- `FcLogon_resp` or `RejectMessage_resp` received;
- correlation match mode (`matched`, `absent`, or `not-applicable`);
- queued message names and uncorrelated-response fallback count.

This prevents a successful TCP connection or JPL welcome from being reported
as a fully initialized FC session when logon has not completed.

## FcLogon compatibility

The live validator defaults `PosVersionId` to `470-02-1.08`, matching the runtime default and the compact DOMS version identifier accepted by deployed controllers. Use `--pos-version-id` only when a site requires a different controller-approved value. Descriptive application names can be rejected as `Version_id too long`.
