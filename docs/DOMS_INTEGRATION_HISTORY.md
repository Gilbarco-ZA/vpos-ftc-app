# DOMS Integration Pass History

Consolidated history of DOMS integration implementation passes. New work should be appended here instead of creating additional pass documents.

## DOMS integration pass 10 - one-time maintenance command transmission

_Source: `doms-integration-pass-10-2026-07-13.md`_

This pass closes the implementation gap between an approved execution permit and the JPL socket while preserving deny-by-default production behavior.

Implemented:

- canonical command digest utility shared by comparison and execution;
- HMAC permit verification at execution time;
- trusted target-fingerprint binding;
- atomic database-backed one-time permit consumption;
- strict maintenance message allowlist;
- direct JPL request with `RejectMessage_resp` promoted to an execution failure;
- success/failure audit records and forecourt events;
- PostgreSQL and Azure SQL migrations;
- targeted replay, drift, kill-switch, success, and failure tests.

The implementation is not considered commissioned until the real-controller Phase 8 and Phase 11 validation items are completed and deployment sign-off is recorded.

---

## DOMS integration pass 11 - live protocol conformance evidence

_Source: `doms-integration-pass-11-2026-07-13.md`_

This pass extends the read-only live-controller validator with payload-level conformance checks for the two remaining field-dependent parser concerns: fuelling-point status coverage and money/volume decimal normalization.

## Delivered

- Captures solicited and startup-unsolicited response envelopes per validation step.
- Flattens `MultiMessage_resp` payloads before parser validation.
- Runs the production `normalizeFpStatusPayload` parser against live responses.
- Verifies required `FpStatus` fields and normalized identifiers/states.
- Validates digit-only JPL money/volume strings.
- Applies explicit site money and volume decimal positions and reports scaled values.
- Adds conformance results to the live validation report and evidence import.
- Adds focused tests for passing, malformed, and missing-decimal scenarios.

## Safety boundary

The runner remains read-only. No transaction buffer is locked or cleared, no pump is authorized, and no PSS configuration is changed.

---

## DOMS integration pass 12 - live conformance release gating

_Source: `doms-integration-pass-12-2026-07-13.md`_

This pass connects the payload-level live conformance report to the production release gate.

## Delivered

- Added release-gate checklist items for live FpStatus parser conformance and live money/volume scaling.
- Added automatic checkpoint derivation from live-controller and focused live-conformance evidence.
- Added support for nested `protocolConformance.summary` evidence payloads.
- Added explicit conformance checkpoints to the live validator evidence file.
- Added regression tests for passing, missing, and failed conformance evidence.

## Operational result

The two field-only TODO items can now be closed with auditable evidence after a target PSS validation run. Simulator or missing evidence does not silently pass either gate.

## Safety

The validator and evidence importer remain read-only and never transmit maintenance or operational write commands.

---

## DOMS integration pass 13 - first-site acceptance contract

_Source: `doms-integration-pass-13-2026-07-13.md`_

This pass adds a deterministic first-site commissioning acceptance pack derived from the field-validation release gate.

## Delivered

- Canonical acceptance-criteria generation from blocking and manual checkpoints.
- Explicit evidence requirements and accountable owner per criterion.
- Immutable SHA-256 acceptance digest.
- Digest-bound deployment sign-off template.
- Administrator JSON export endpoint.
- Unit coverage for digest stability, criteria drift, and informational-item exclusion.

## Operational outcome

Field engineers and support teams now receive one concrete acceptance contract rather than an informal collection of TODO items. The two remaining scope tasks still require human confirmation, but their review can now be performed against an exported, versioned definition.

## Safety

The pass is read-only and does not send commands to the PSS.

---

## DOMS integration pass 14 - deployment sign-off reconciliation

_Source: `doms-integration-pass-14-2026-07-13.md`_

This pass closes the software gap between field-validation evidence, the deterministic first-site acceptance definition, and final deployment sign-off.

## Added

- Current-digest verification before sign-off
- Production blocker and release-status enforcement
- Physical PSS fingerprint binding
- Named field engineering, support, software, and deployment owners
- Approved/rejected decision recording
- Exception capture for rejected commissioning attempts
- Audit log and forecourt event persistence
- Administrator sign-off API
- Unit coverage for stale digests and blocker enforcement

## Safety boundary

The endpoint records evidence and a release decision only. It cannot transmit DOMS/PSS commands or activate maintenance execution.

---

## DOMS integration pass 15 - persisted approval-bound execution permits

_Source: `doms-integration-pass-15-2026-07-13.md`_

This pass closes a trust-boundary gap between deployment sign-off and PSS
maintenance execution.

## Changes

- Fixed the acceptance-pack filename timestamp transform so Tailwind/PostCSS
  does not interpret the regular-expression literal as a generated utility.
- Added PostgreSQL and Azure SQL deployment-sign-off migrations.
- Persisted administrator deployment decisions in a dedicated operational
  table in addition to the audit log.
- Replaced caller-provided production checkpoint assertions with server-side
  field-readiness evaluation.
- Required a current approved sign-off matching the station, acceptance digest,
  and physical PSS fingerprint.
- Added version 2 execution permits bound to sign-off ID, acceptance digest,
  and deployment artifact.
- Updated command execution verification and audit metadata for version 2.
- Added regression coverage for missing persisted approval.

## Safety effect

A field engineer cannot mint a write permit by posting
`deployment-signoff-approved` or `field-validation-complete`. Both conditions
are resolved from trusted server state.

---

## DOMS integration pass 16 - remaining-work normalization

_Source: `doms-integration-pass-16-2026-07-13.md`_

## Purpose

Close the code-side DOMS backlog for the first production scope and separate implementation work from local verification, field validation, external endpoint validation, organizational approval, and deliberately deferred scope.

## Changes

- Added `DOMS_REMAINING_WORK.json` as the machine-readable source for remaining work.
- Added `docs/doms-remaining-work-classification.md`.
- Added `scripts/doms-release-evidence.js` and `npm run doms:release:evidence`.
- Marked the confirmed build, full tests, and JPL protocol test tasks complete.
- Marked Phase 11 implementation complete and retained live write-path commissioning as a field gate.
- Marked EPT/payment as deferred from first production scope.
- Marked `FcAuxCmd` as out of scope until an approved workflow exists.
- Reclassified additional `FcStatus` subcodes as evidence-driven typed coverage rather than unfinished core code.
- Updated the TODO status language to reflect the database-backed, approval-bound one-time execution adapter.

## Result

There are no open core code implementation tasks for the first-production DOMS/JPL scope. Remaining unchecked TODO items require local simulator evidence, real controller/site validation, Tanzania endpoints, or accountable human approval.

---

## DOMS integration implementation pass 2 - 2026-07-10

_Source: `doms-integration-pass-2-2026-07-10.md`_

## Scope

This pass closed the next code-verifiable items in `DOMS_INTEGRATION_TODO.md`:

- executable coverage for every registered JPL request builder;
- deterministic connection-policy and reconnect-backoff tests;
- simulator validation of connection, logon, startup bootstrap status, heartbeats, forced disconnect, reconnect, and dead-session detection;
- simulator validation that a buffered supervised transaction remains readable after the client connection is restarted.

Live PSS behavior, field scaling, device races, stale-lock recovery, and production build acceptance remain open.

## Implemented

### Request-builder registry

`protocol/commands.ts` now exports `JPL_COMMAND_NAMES` as the runtime source of truth for the `JplCommandName` type. The registry contains 96 request names.

`domsCommandBuilderCoverage.test.ts` provides exactly one executable action/payload fixture for each registered request name. The test fails if:

- a request name is added without a fixture;
- a fixture is duplicated;
- an action stops producing its expected command;
- the produced envelope omits `subCode` or `data`.

The delivery-start marker now preserves optional `DeliveryReturnBytes`; the finish marker deliberately omits them.

### Session and reconnect policy

`sessionPolicy.ts` isolates the session timing rules from the socket lifecycle:

- default client heartbeat interval: 15 seconds;
- minimum accepted heartbeat interval: 5 seconds;
- default dead-connection threshold: 30 seconds;
- dead threshold is always at least heartbeat interval plus 5 seconds;
- reconnect delay uses capped exponential backoff.

`lifecycle.ts` now consumes this policy for reconnect scheduling and dead-session evaluation instead of duplicating the calculations inline.

### Simulator resilience controls

The local simulator server now exposes development-only controls and counters:

- active and total connections;
- received message and client-heartbeat counts;
- forced disconnect count;
- pause/resume server heartbeats;
- disconnect all current clients.

The new one-command session self-test performs this sequence:

1. connect and receive the JPL welcome message;
2. log on and observe an unsolicited startup `FcStatus_resp`;
3. observe a server heartbeat;
4. send a client heartbeat and confirm the server received it;
5. read a supervised transaction;
6. force the socket closed;
7. reconnect and log on again;
8. read the same transaction and compare its `FpId`, `TransSeqNo`, and `TransPars`;
9. pause server heartbeats and confirm the dead-connection policy classifies the session as dead.

Run it with:

```bash
npm run doms:jpl-session:selftest
```

## Legacy comparison

The supplied `vpos-app` source was available during this pass. Its JPL sequence includes capped reconnect backoff, a reconnect watchdog, transaction identity based on fuelling point and transaction sequence number, duplicate collection guards, and unlock fallback behavior. The FTC implementation was not copied from that source; the comparison was used to ensure the new isolated policy and simulator tests cover the same operational risk categories.

The supplied `vpos-fiscal-tz` source was also available. No Tanzania fiscalization behavior was changed in this DOMS-focused pass, and the existing fiscal parity TODO status was left unchanged.

## Verification performed

The targeted DOMS validation run completed with **164/164 tests passing** across ten suites. It used the real Zod schemas and an isolated substitute for the unavailable private DOMS package. The new coverage includes:

- command-builder registry coverage: 99 tests passed, covering all 96 registered request names plus registry, unsupported-action, and delivery-return-byte assertions;
- session policy: 4 tests passed;
- simulator session resilience: 1 end-to-end test passed;
- existing numeric, authorization, parser, optional-module, simulator, simulator-self-test, and dynamic-tank suites also passed.

The response-parser registry fixture was corrected so `RejectMessage_resp` is validated with the mandatory `RejectCode` object under the real schema.

The session resilience test uses only the local simulator and Node sockets. It does not claim live-controller acceptance.

## Build status

A clean dependency install was attempted before the build:

```text
npm ci --ignore-scripts --no-audit --no-fund --fetch-retries=0 --fetch-timeout=10000
```

The private Azure package feed remained unreachable and returned `EAI_AGAIN` for `@gilbarcoafs/vpos-storage@0.0.8`. `npm run build` was then attempted, but could not start because `next` was not installed after the failed dependency installation. The production build task remains open and must be run in the local/private-feed environment.

## Field-validation boundary

The following remain open intentionally:

- `npm run build` in an environment with access to the private Azure package feed;
- real PSS reconnect behavior during network interruption;
- transaction lock races with another POS;
- ID-zero stale-lock recovery against a real controller;
- live decimal, money, volume, and grade restriction validation;
- multi-site acceptance evidence.

---

## DOMS integration implementation pass - 2026-07-10

_Source: `doms-integration-pass-2026-07-10.md`_

## Scope

This pass focused on code-completable items in `DOMS_INTEGRATION_TODO.md` that could be verified without a live PSS:

- typed dispense authorization operations;
- service-mode and valid-grade abstraction;
- strict fixed-width numeric normalization;
- exhaustive optional-module request-builder coverage;
- exhaustive registered response-parser dispatch coverage.

Live-site, simulator-acceptance, endpoint, and commissioning tasks were not marked complete.

## Implemented

1. Added `dispenseAuthorization.ts` with typed `standard`, `preset`, `prepay`, and `extended` operations.
2. Routed all dispense authorization actions in `protocol/commands.ts` through the typed operation resolver and envelope builder.
3. Normalized nested `AuthorizePars` instead of forwarding raw nested values.
4. Added service-mode family classification for `1x` through `6x` modes and an `unknown` fallback.
5. Added valid-grade normalization and deduplication.
6. Added canonical `DEC4` and `DEC10` helpers and consolidated fixed-width decimal validation.
7. Reused strict `DEC4` normalization in transaction request construction.
8. Added table-driven tests for every currently supported optional-module command builder.
9. Added a registry-wide response-parser dispatch test in addition to focused parser assertions.
10. Added links from completed TODO items to implementation, test, and protocol-note files.

## Verification performed

The following targeted suites passed using Node's test runner with TypeScript transpilation:

- `domsJplNumericTypes.test.ts`: 4 passed;
- `domsDispenseAuthorization.test.ts`: 8 passed;
- `domsResponseParsers.test.ts`: 5 passed;
- `domsOptionalCommandBuilders.test.ts`: 33 passed.

All changed TypeScript files also passed a `transpileModule` syntax diagnostic check.

The optional command-builder suite was executed with isolated test stubs for the unavailable private DOMS package and for Zod schema pass-through. It therefore verifies action dispatch and payload normalization, but it does not replace a production dependency install or real schema execution.

## Build status

A clean dependency install was attempted with:

```text
npm ci --ignore-scripts --no-audit --no-fund --fetch-retries=0 --fetch-timeout=10000
```

It failed before a production build could run because the private Azure package feed was unreachable:

```text
EAI_AGAIN pkgs.dev.azure.com
@ GilbarcoAFS / vpos-storage 0.0.8
```

`npm run build`, the full repository test suite, and production JPL protocol tests therefore remain open. They must be run in an environment with access to the private `@gilbarcoafs` packages.

## TODO movement

Progress moved from **298/360 (83%)** to **304/360 (84%)**. Six code-level tasks were completed. Field-dependent preset scaling and grade-lock behavior remain open for simulator and live-controller verification.

## External comparison inputs

The DOMS JPL protocol document was available for this pass. The fiscal engine and current `vpos-app` source archives were not visible in the working file set, so cross-repository fiscal-engine parity analysis remains pending.

---

## DOMS integration implementation pass 3 - 2026-07-10

_Source: `doms-integration-pass-3-2026-07-10.md`_

## Scope

This pass hardens transaction-buffer replay and recovery around reconnects,
process restarts, multiple stations, and competing POS locks. It does not claim
live-controller acceptance. Field validation, production build verification,
and controlled `ID_ZERO` execution remain separate release gates.

## Protocol boundary

The implementation follows the transaction-buffer and lock rules in the Doms
POS Protocol application-level specification:

- supervised and unsupervised buffer-status responses keep their actual `00H`,
  `01H`, or `03H` subcode;
- startup polling attempts the extended `03H` shape first, then grade-aware
  `01H`, then legacy `00H` only when the controller rejects a subcode as
  unsupported;
- a transaction locked with the configured POS ID can be resumed or unlocked
  with that same POS ID;
- a lock owned by another POS is not released automatically;
- `PosId=00` / `ID_ZERO` remains restricted to an explicit operator and field
  recovery procedure.

## Implemented

### Station-scoped transaction identity

Replay, capture, in-flight, and per-pump lock keys now include:

- station ID;
- source mode (`supervised` or `unsupervised`);
- fuelling point ID;
- transaction sequence number where applicable.

This prevents two stations with the same pump and sequence numbers from
suppressing or serializing each other's work in a shared process.

### Correct lock serialization

The replay lock queue now removes its completed tail correctly. Previously,
the cleanup comparison used a different promise object, so completed lock
entries could remain in memory indefinitely.

Work is serialized per station, source mode, and pump. Unrelated stations and
pumps remain concurrent.

### Station-scoped recovery single-flight

Transaction-recovery runs are deduplicated per station rather than globally.
Two requests for the same station share one in-flight run, while different
stations can recover concurrently. Failed runs release the registry entry so a
later retry can proceed.

### Durable clear recovery

Recovery now stores and reuses the JPL `data` payload rather than nesting a
complete request envelope inside another clear request. Existing checkpoints
that contain a legacy full envelope are unwrapped automatically.

Unsupervised transactions now follow this decision matrix:

| Buffer lock  | Durable clear payload | Action                                                                 |
| ------------ | --------------------- | ---------------------------------------------------------------------- |
| Empty / `00` | Either                | Read, persist, and clear normally.                                     |
| Current POS  | Yes                   | Resume the clear directly from the checkpoint.                         |
| Current POS  | No                    | Unlock with the same POS ID, then reread and persist.                  |
| Foreign POS  | Either                | Record `blocked_by_foreign_pos`; do not read, clear, or use `ID_ZERO`. |

### Buffer-status compatibility

All three required buffer-status variants are normalized without pretending a
legacy `00H` response is the extended `03H` format. Event routing, fallback
polling, unsolicited listeners, and the transaction-buffer watcher now preserve
the real subcode.

Normalization covers:

- legacy pointer lists;
- grade-aware pointers;
- extended money and volume values;
- `TransInfoMask` and `TransInfoFlags`;
- explicit supervised and unsupervised list names;
- empty buffers without producing a phantom transaction.

Empty buffer responses still update per-pump buffer health from the response
`FpId`.

### Persistence idempotency

The in-memory seen set is updated only after transaction persistence succeeds.
A failed database write therefore remains retryable instead of being suppressed
until process restart. The durable transaction identity remains station, source
mode, fuelling point, and transaction sequence number.

## Verification

The focused replay self-test covers 15 assertions across four suites:

- station-scoped replay identities and safe lock actions;
- replay lock serialization, cleanup, and in-flight retry behavior;
- station-scoped recovery single-flight behavior;
- `00H`, `01H`, `03H`, extended-value, and empty-buffer normalization.

Run it with:

```bash
npm run doms:jpl-replay:selftest
```

The broader targeted DOMS run completed with **179/179 tests passing** across
14 suites. It includes the previous numeric, authorization, response-parser,
request-builder, optional-module, simulator, session, and dynamic-tank coverage
plus this pass's replay and normalization tests. The private DOMS package was
represented by the same isolated substitute used in earlier passes; this does
not replace validation with the production package.

A strict TypeScript check passed for the new pure policy, concurrency,
normalization, and test modules. A wider isolated check also caught and was used
to fix a checkpoint repository return-type error and a duplicate block-scoped
variable before packaging. The wider check still reaches unrelated existing
command-schema typing errors when run against public dependency substitutes;
it is not a replacement for the production build.

## Build status

A clean dependency install was attempted with retries disabled. The private
Azure feed remained unavailable and returned `EAI_AGAIN` while resolving
`@gilbarcoafs/vpos-storage@0.0.8`. Since `next` was not installed, a production
build could not be started. The build checkbox remains open.

## Remaining release gates

- run `npm run build` with access to the private package feed;
- run the complete project test runner in the deployment toolchain;
- verify all three buffer-status variants against the target PSS release;
- reproduce a real competing-POS lock and confirm it remains non-destructive;
- validate same-POS locked transaction recovery after a real process restart;
- approve and field-test any operator workflow that intentionally uses
  `ID_ZERO`.

---

## DOMS integration pass 4 - live bootstrap compatibility

_Source: `doms-integration-pass-4-2026-07-10.md`_

Date: 2026-07-10

## Field evidence received

The target controller at `192.168.68.123` responded to ICMP and accepted TCP
connections on both JPL ports:

- `8888`: plain JPL TCP connection succeeded;
- `8889`: secure JPL TCP connection succeeded.

A direct read from port `8888` returned an 83-byte STX/ETX-framed JPL welcome:

```json
{
  "name": "jpl",
  "subCode": "00H",
  "solicited": false,
  "data": { "version": "470-02-1.10" }
}
```

This proves the controller, JTM service, port, framing, and welcome version are
available. The earlier live-validator timeout therefore occurred after welcome
processing, while waiting for the FC logon result.

## Root cause addressed

The live validator previously required every solicited response, including
`FcLogon_resp` and `RejectMessage_resp`, to echo the request `correlationId`.
The validator would queue an otherwise valid response that omitted the field
and eventually report a timeout.

The runner now:

1. prefers an exact correlation-ID match;
2. accepts an expected solicited response with no correlation ID because the
   runner sends only one request at a time;
3. rejects responses carrying a different correlation ID;
4. rejects unsolicited messages even when their message name resembles an
   expected response;
5. records each uncorrelated-response fallback in diagnostics.

## Reporting corrections

The report now distinguishes:

- TCP connection established;
- JPL welcome received;
- JPL welcome version;
- FC session ready after successful logon.

Bootstrap duration, parsed message names, frame counts, framing errors, queued
messages, and correlation matching are retained in the report. Generated field
evidence now sets `confirmManualValidation` to `false` and requires explicit
operator confirmation.

## Validation

Targeted regression validation passed:

- live read-only validator: 3 tests;
- simulator harness: 5 tests;
- simulator validation profiles: 2 tests;
- session resilience: 1 test;
- session policy: 4 tests.

Total: 15 tests passed.

The live-controller acceptance items remain open until the patched validator is
run again and captures `FcLogon_resp`, installation status, and the requested
read-only workflow responses.

---

## DOMS Integration Pass 4 - Pump Recovery Authorization

_Source: `doms-integration-pass-4-2026-07-13.md`_

## Scope

This pass closes the remaining code-side role-policy and recovery-runbook gaps for fuelling-point emergency and fault recovery commands.

## Implementation

- Added command-aware authorization for DOMS requests.
- Restricted `CANCEL_FP_ESTOP`, `RESET_FP`, and `FORCE_RESET_FP` to administrators.
- Allowed managers and administrators to issue `ESTOP_FP` and `CLEAR_FP_ERROR`.
- Applied the policy to the generic `send` command and the legacy clear-error alias.
- Added deterministic unit coverage for command normalization and role decisions.
- Added a pump alarm and emergency recovery runbook covering safe sequencing, no-reset conditions, and evidence retention.
- Updated the DOMS integration checklist and regenerated progress links.

## Validation

Passed:

```text
npx tsx --test tests/forecourt/domsCommandAuthorization.test.ts
4 tests passed
```

Prettier could not run in the isolated package because the configured `@ianvs/prettier-plugin-sort-imports` dependency was not installed. The changed TypeScript files were manually aligned with the repository's import and formatting conventions.

---

## DOMS integration pass 5 - live read-only validator protocol alignment

_Source: `doms-integration-pass-5-2026-07-10.md`_

Date: 2026-07-10

## Trigger

A live `full-readonly` validation against `192.168.68.123:8888` established a valid JPL session and passed 14 of 19 checks. The remaining failures exposed request-shape and diagnostic gaps rather than a connection failure.

## Changes

- `FpInfo_req` now uses SUBC `01H` with `FpInfoParId` as required by the protocol.
- `FpFuellingData_req` now uses the extended SUBC `01H` variant.
- An idle-pump rejection (`not fuelling` / `no current trans`) is treated as a valid operational outcome rather than a protocol failure.
- `TgData_req` now includes `TankDataItemId` values for the primary inventory fields.
- `TankControlStatus_req` now includes `TankId: "00"` to request all installed tanks.
- Invalid frame diagnostics now retain a bounded, sanitized preview plus top-level keys, detected message metadata, byte length, and data type.
- Added regression assertions for all corrected request shapes.

## Safety

The validator remains read-only. It does not read or lock transaction buffers and does not issue clear, authorize, reset, price, installation, maintenance, or dynamic tank write commands.

## Validation

- `npx tsx --test tests/forecourt/domsJplLiveReadOnlyValidation.test.ts`
- 4 tests passed, 0 failed.

## Required field rerun

Run the full read-only profile again and attach the generated report and evidence files. The TODO evidence checkpoints should only be advanced from the new controller output.

---

## DOMS integration pass 6 - live startup evidence and field validation closure

_Source: `doms-integration-pass-6-2026-07-10.md`_

Date: 2026-07-10

## Trigger

The live `full-readonly` profile against `192.168.68.123:8888` reached a stable JPL session on version `470-02-1.10` and passed 17 of 19 checks with no critical failures. `TankControlStatus_resp` was observed four times immediately after logon, but the later duplicate solicited `TankControlStatus_req` did not produce another response and timed out.

## Changes

- Added an explicit `acceptStartupObservation` capability for read-only validation steps.
- Marked `tank-control-status` as eligible for startup evidence.
- When an expected status response is already observed unsolicited immediately after logon, the validator records a passed step without issuing a duplicate request.
- The result records:
  - `correlationId: "startup-observation"`
  - `correlationMatch: "not-applicable"`
  - an operational outcome explaining that unsolicited controller evidence was used.
- Added regression coverage for startup-observed tank-control status.
- Updated the TODO checklist to record successful read-only validation against a real DOMS/PSS controller while retaining write-path and full site-acceptance gates.

## Why this is protocol-correct

DOMS sends status changes unsolicited after logon. A status response observed from the live controller is valid evidence that the service is installed and operational. Requiring a second duplicate response is unnecessarily strict for controller variants that emit the status during bootstrap but do not answer the immediately repeated status request.

## Live evidence incorporated

- TCP connected: yes
- JPL welcome: yes
- JPL version: `470-02-1.10`
- FC logon: passed
- Installation snapshot: captured
- Critical read-only workflow failures: `0`
- Fuelling points observed: `4`
- Tank gauges observed: `4`
- PSS writes attempted: no
- Transaction-buffer reads attempted: no

The remaining vending warning is an expected unsupported optional-module result and is not a release-blocking failure.

## Validation

Focused test command:

```bash
npx tsx --test tests/forecourt/domsJplLiveReadOnlyValidation.test.ts
```

A full local build/test run is still required in the development environment with access to the private package feed.

---

## DOMS integration pass: TLS client authentication

_Source: `doms-integration-pass-7-2026-07-13.md`_

This pass adds production-grade TLS material handling for the database-driven JPL runtime.

## Delivered

- TLS is enabled when `JPL_TLS_REQUIRED=true` or the configured JPL port is `8889`.
- Optional private CA bundle support.
- Optional mutual TLS client certificate and private key support.
- Atomic validation requiring both client certificate and key.
- Configurable SNI/server name, certificate verification, and minimum TLS version.
- Station KV overrides for all TLS settings.
- Health output reports only configuration presence; PEM content and private key material are never exposed.
- Fixed final-confirmation route import and completed `field_engineer` role hierarchy integration found during static validation.

## Validation boundary

The repository dependency install could not be completed in the isolated environment. The first static TypeScript run identified three build defects from the preceding role/confirmation pass; those defects were corrected. A subsequent run could not start because the partial dependency install did not provide the Node type package. Run the normal local build and test commands after restoring dependencies.

---

## DOMS integration pass 8 - resilience evidence release gate

_Source: `doms-integration-pass-8-2026-07-13.md`_

## Scope

This pass connects the existing DOMS/JPL session-resilience self-test to the field-validation release gate.

## Changes

- Added automatic evidence import for `jpl-session-resilience` and `network-interruption` evidence types.
- Added production-blocking checkpoints for reconnect recovery, dead-connection timeout detection, transaction recovery, and bidirectional heartbeat handling.
- Added support for the native self-test report shape with result flags nested under `summary`.
- Added regression coverage for passing and failing resilience evidence imports.
- Added operator documentation with the expected evidence payload and safety boundary.

## Safety boundary

The evidence importer is read-only and sends no DOMS/PSS command. Simulator evidence does not replace controlled target-controller validation; newer live evidence should supersede simulator checkpoints before deployment sign-off.

---

## DOMS integration pass 9 - controlled execution permit foundation

_Source: `doms-integration-pass-9-2026-07-13.md`_

This pass adds the safety gate that must sit between maintenance review/confirmation and any future DOMS/PSS write adapter.

## Delivered

- deny-by-default feature flag
- independent global kill switch
- strict field-engineer and station binding
- allowlisted installation/clear-install command names
- command digest drift protection
- five-minute reconciliation freshness limit
- field-validation and deployment-sign-off checkpoint requirements
- physical target fingerprint confirmation
- 30-second signed permit issuance
- API endpoint at `POST /api/admin/forecourt/maintenance/execution-permit`
- deterministic gate tests

## Safety boundary

No JPL request is transmitted. The permit response explicitly reports `sendsDomsCommand: false`. Phase 11 remains open until field validation is complete and a separately reviewed adapter verifies and consumes permits exactly once.

---
