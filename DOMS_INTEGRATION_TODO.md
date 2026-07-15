# DOMS Integration Todo List

<!-- doms-todo-progress:start -->

**Overall Progress: 92%** (342 / 372 tasks completed)

_Last updated: July 13, 2026 at 08:40 AM_

### Per-Section Progress

| Section                                                                                                                                | Completed | Total | Progress                  |
| -------------------------------------------------------------------------------------------------------------------------------------- | --------- | ----- | ------------------------- |
| **[1) Finalize scope and integration contract](#1-finalize-scope-and-integration-contract)**                                           | 7         | 9     | ███████████████░░░░░ 78%  |
| **[2) Transport, session, and connection management](#2-transport-session-and-connection-management)**                                 | 15        | 15    | ████████████████████ 100% |
| **[3) Core protocol envelope handling](#3-core-protocol-envelope-handling)**                                                           | 14        | 14    | ████████████████████ 100% |
| **[4) Forecourt logon and bootstrap](#4-forecourt-logon-and-bootstrap)**                                                               | 13        | 13    | ████████████████████ 100% |
| **[5) Current functionality already present - verified and hardened](#5-current-functionality-already-present-verified-and-hardened)** | 16        | 18    | █████████████████░░░ 89%  |
| **[6) General forecourt controller functions](#6-general-forecourt-controller-functions)**                                             | 14        | 14    | ████████████████████ 100% |
| **[7) Forecourt special functions](#7-forecourt-special-functions)**                                                                   | 14        | 14    | ████████████████████ 100% |
| **[8) Dispense control - command surface completion](#8-dispense-control-command-surface-completion)**                                 | 23        | 24    | ███████████████████░ 96%  |
| **[9) Dispense control - transaction handling completion](#9-dispense-control-transaction-handling-completion)**                       | 19        | 19    | ████████████████████ 100% |
| **[10) Wetstock / tank integration completion](#10-wetstock-tank-integration-completion)**                                             | 20        | 21    | ███████████████████░ 95%  |
| **[11) Price, payment, and optional protocol modules](#11-price-payment-and-optional-protocol-modules)**                               | 16        | 16    | ████████████████████ 100% |
| **[12) Configuration, commissioning, and site setup](#12-configuration-commissioning-and-site-setup)**                                 | 14        | 14    | ████████████████████ 100% |
| **[13) App-level adapters and internal abstractions](#13-app-level-adapters-and-internal-abstractions)**                               | 9         | 9     | ████████████████████ 100% |
| **[14) Observability and supportability](#14-observability-and-supportability)**                                                       | 15        | 15    | ████████████████████ 100% |
| **[15) Testing and validation](#15-testing-and-validation)**                                                                           | 28        | 31    | ██████████████████░░ 90%  |
| **[16) Recommended implementation order](#16-recommended-implementation-order)**                                                       | 11        | 13    | █████████████████░░░ 85%  |
| **[17) Definition of done](#17-definition-of-done)**                                                                                   | 6         | 13    | █████████░░░░░░░░░░░ 46%  |
| **[18) DOMS/JPL reconciliation and FTC mapping remediation](#18-domsjpl-reconciliation-and-ftc-mapping-remediation)**                  | 15        | 15    | ████████████████████ 100% |
| **[19) DOMS/PSS maintenance planning and approval gate](#19-domspss-maintenance-planning-and-approval-gate)**                          | 19        | 19    | ████████████████████ 100% |
| **[20) Tanzania fiscalization routing](#20-tanzania-fiscalization-routing)**                                                           | 10        | 14    | ██████████████░░░░░░ 71%  |
| **[21) Build, release, and field validation](#21-build-release-and-field-validation)**                                                 | 17        | 23    | ██████████████░░░░░░ 74%  |
| **[23) vpos-fiscal-tz feature parity inside FTC](#23-vpos-fiscal-tz-feature-parity-inside-ftc)**                                       | 27        | 29    | ██████████████████░░ 93%  |

<!-- doms-todo-progress:end -->

---

This checklist tracks the production readiness of the DOMS/JPL integration in `vpos-ftc-app`. The recent implementation passes added Tanzania fiscalization routing, local credit-note fiscalization, Tanzania legacy queue/artifact import mapping, Tanzania certificate/signing, EWURA EFPP parity, EWURA retry/reconciliation, partial-fiscalization policy, Tanzania fiscal output rendering, developer simulator harness, JPL protocol hardening, production-module command coverage, admin workflow controls, diagnostics, reconciliation, FTC-side mapping remediation, mapping rollback, maintenance planning, approval sessions, preview-only maintenance command envelopes, and a hard-disabled maintenance execution safety gate, field validation readiness/audit checkpoints, and persistent DOMS service-log/BOR collection audit checkpoints across automatic drain and manual command paths, plus admin-triggered transaction-buffer recovery dry-run/live retry controls backed by durable recovery run audit records, and unattended EPT receipt capture/redaction/persistence for extended unsupervised transaction clears, plus expanded wetstock normalization for tank gauge data, typed alarm mappings, delivery status clear candidates, and full tank-delivery report payload parsing, plus classified service-log routing and durable BOR replay/processing state after DOMS buffer clears, plus durable wash transaction capture/review state for WpStatus/WpUnSupTrans and future clear-candidate automation, plus optional-module runtime persistence for price poles, digital I/O, sensors, vending statuses/errors, and vending totals, plus evidence-backed field-validation release-gate rollups and bulk evidence import for build/test, simulator, live-controller, Tanzania endpoint, and cloud-cutover validation, plus restricted dynamic tank data governance for EnteredDensity validation, audit persistence, admin API dispatch, and workflow visibility, plus an operator-facing DOMS operational readiness rollup that converts connection/session, forecourt controller, pump, wetstock, optional module, special-record, and release-gate state into first-class action items, plus a deterministic local DOMS/JPL simulator harness for framed socket, logon, heartbeat, unsolicited status, reject, transaction recovery, wetstock, wash, and optional-module rehearsal without a live PSS, plus a read-only simulator validation runner that exports importable field-validation evidence and verifies unsupported requests return RejectMessage_resp rather than false-positive acknowledgements, plus a live-controller read-only validation runner/API that performs JPL welcome/logon/status checks and emits importable live-controller field evidence without transaction locks or PSS writes.

The status below separates **code/admin coverage** from **field validation**. Several protocol areas are now code-complete or preview-complete, but remain pending validation against a DOMS/PSS simulator and a real controller. The Tanzania fiscalization work now implements FTC-native local/proxy routing, local sale/credit-note handling, TRA/EWURA payload builders, retry/reconciliation, output rendering, simulator support, parity validators, counter/day-close checks, route-switch safety checks, cloud cutover guidance, downloadable DOMS/JPL support bundles, and bulk FTC mapping remediation with CSV/JSON import, live DOMS/PSS pre-validation, commissioning readiness checks, and a JPL-only cutover runbook; live endpoint validation remains pending. The DOMS/JPL runtime now also exposes a typed response-parser layer and domain snapshot API so UI/application workflows can migrate away from raw protocol field names while retaining raw payloads for support.

Safety boundary: PSS writes remain deny-by-default and deployment-disabled. A database-backed, digest-bound, one-time execution adapter exists, but it can transmit only allowlisted maintenance commands after field validation, current deployment approval, field-engineer authorization, target fingerprint binding, kill-switch checks, and atomic permit claim.

## 1) Finalize scope and integration contract

- [x] Confirm first-release scope: dispense + wetstock/tanks are mandatory MVP.
- [x] Confirm optional protocol families: price poles, wash, digital I/O, serial server, sensors, and vending remain optional.
- [x] Confirm DOMS payment/EPT control is out of first-release scope.
- [x] Confirm TLS is configurable but not mandatory for the current target environments.
- [x] Document supported PSS/JPL version floor and correlation-ID expectations.
- [x] Document that PSS Configurator remains the preferred source for logical device installation.
- [x] Add read-only reconciliation before exposing any PSS install/clear-install flow.
- [ ] Confirm site commissioning expectations with field engineers and support teams.
- [ ] Confirm exact acceptance criteria for the first live DOMS/PSS site.

## 2) Transport, session, and connection management

- [x] Add configurable JPL host and port.
- [x] Support unencrypted JPL on port 8888.
- [x] Support TLS JPL on port 8889 where configured.
- [x] Expose secure-mode configuration from app settings to DOMS client bootstrap.
- [x] Validate the server `jpl` welcome/version response.
- [x] Surface unsupported-version diagnostics.
- [x] Implement permanent socket keepalive behavior.
- [x] Implement client heartbeat scheduling.
- [x] Detect dead connections when no inbound message arrives within the protocol timeout window.
- [x] Implement reconnect with backoff and clean session re-bootstrap.
- [x] Ensure reconnect re-runs logon, subscriptions, status update mode, and startup reconciliation.
- [x] Add online/offline lifecycle events.
- [x] Add connection health metrics and structured logs.
- [x] Add client certificate configuration if a target PSS deployment requires mutual TLS. See `docs/doms-jpl-mutual-tls.md`.
- [x] Add explicit framing-level diagnostics for malformed STX/ETX payloads.

## 3) Core protocol envelope handling

- [x] Normalize incoming JPL messages by `name`, `subCode`, `solicited`, and `data`.
- [x] Keep outbound request serialization case-sensitive for `name` and `subCode`.
- [x] Add canonical JPL type helpers for `ID2`, `ID_ZERO`, `DEC2`, `DEC6`, `CODE1`, `CODE2`, and `FC_DATE_AND_TIME`.
- [x] Add correlation ID support to outbound requests.
- [x] Preserve correlation IDs through logs and diagnostics.
- [x] Accept serialized solicited responses that omit `correlationId`, while still rejecting mismatched correlation IDs and unsolicited lookalikes ([live validator tests](tests/forecourt/domsJplLiveReadOnlyValidation.test.ts)).
- [x] Add a generic `RejectMessage_resp` handler.
- [x] Persist structured DOMS/JPL reject events.
- [x] Map reject reasons into typed diagnostics.
- [x] Surface `RejectInfo` and `RejectInfoText` in admin diagnostics.
- [x] Support `MultiMessage_resp` dispatch across subscribed message families.
- [x] Add protocol fixtures for single-message and multi-message parsing.
- [x] Add central builders/schemas for the expanded operational command surface.
- [x] Add exhaustive builder coverage for every supported optional module command ([tests](tests/forecourt/domsOptionalCommandBuilders.test.ts)).

## 4) Forecourt logon and bootstrap

- [x] Centralize `FcLogon` request construction.
- [x] Centralize `FcAccessCode` composition.
- [x] Ensure `RI` is present unless intentionally disabled.
- [x] Make unsolicited feature flags configurable.
- [x] Support current required access-code flags: `UNSO_FPSTA_3`, `UNSO_TRBUFSTA_3`, `UNSO_INSTSTA_1/2`, `UNSO_TGSTA_1/2`, `UNSO_DELIVSTA_1`, and `UNSO_PRISTA_1`.
- [x] Make Max Fuelling Data Rate configurable.
- [x] Validate `PosId` rules at startup.
- [x] Prevent `PosId=00` from being assigned to a real POS client.
- [x] Run `change_FcStatusUpdateMode` during bootstrap where required.
- [x] Add startup reconciliation for the minimum viable site snapshot.
- [x] Feed latest DOMS install/status snapshots into reconciliation.
- [x] Enforce unique `PosId` per physical client/session in multi-POS deployments ([database lease](src/modules/forecourt/infrastructure/jpl/posSessionLease.ts); [migration](scripts/migrations/postgres/1250_forecourt_jpl_pos_sessions.sql)).
- [x] Finalize crash-recovery strategy for lock release paths requiring `ID_ZERO` ([policy](docs/doms-transaction-recovery.md); [pass 3](docs/doms-integration-pass-3-2026-07-10.md)).

## 5) Current functionality already present - verified and hardened

- [x] JPL/TCP lifecycle bootstrap exists.
- [x] Forecourt logon exists.
- [x] Access-code enrichment for pump status and transaction-buffer status exists.
- [x] Unsolicited `FpStatus_resp` handling exists.
- [x] Transaction buffer watcher exists.
- [x] Startup reconciliation for transaction buffers exists.
- [x] Standard `authorize_Fp` mapping exists.
- [x] `cancel_FpAuth` mapping exists.
- [x] `clear_FpError` mapping exists.
- [x] Basic tank operations exist for `TgData_req`, `change_DynamicTankData_req`, and `TgErrorMsg_req`.
- [x] Add request/response validation for currently supported commands.
- [x] Confirm logs include correlation IDs and DOMS reject details.
- [x] Confirm `MultiMessage_resp` works for status and buffer families.
- [x] Add exhaustive tests for all current command builders ([registry](src/modules/forecourt/infrastructure/jpl/protocol/commands.ts); [tests](tests/forecourt/domsCommandBuilderCoverage.test.ts)).
- [ ] Confirm decimal, money, and volume normalization against live PSS data.
- [ ] Confirm unsolicited `FpStatus` parsing against all fields used by UI/workflows.
- [x] Confirm transaction replay/recovery is idempotent across reconnects and restarts ([policy](src/modules/forecourt/infrastructure/jpl/transactionReplayPolicy.ts); [tests](tests/forecourt/domsReplayConcurrency.test.ts); [pass 3](docs/doms-integration-pass-3-2026-07-10.md)).
- [x] Confirm watcher behavior when buffers are empty, locked, stale, or racing with another POS in deterministic code tests; live competing-POS validation remains a field gate ([normalization tests](tests/forecourt/domsTransactionBufferNormalization.test.ts); [lock-policy tests](tests/forecourt/domsTransactionReplayPolicy.test.ts)).

## 6) General forecourt controller functions

- [x] Add API layer for `FcStatus`.
- [x] Map `FcStatus1Flags` and `FcStatus2Flags` into typed internal state.
- [x] Surface service-message-ready, BOR-exists, RTC error, fallback mode, and stored-transaction restrictions.
- [x] Add `FcInstallStatus` read and unsolicited handling.
- [x] Add `FcPriceSetStatus` read and unsolicited handling.
- [x] Add `FcOperationModeStatus` read support.
- [x] Add `change_FcOperationModeNo` support.
- [x] Add `FcDateAndTime` read support.
- [x] Add `change_FcDateAndTime` support for controlled commissioning/ops.
- [x] Add `UtilEcho` support for connection diagnostics.
- [x] Keep additional `FcStatus` subcode coverage evidence-driven: retain unknown variants in raw diagnostics and add typed parsers only when live field evidence identifies a required variant.
- [x] Surface hardware/software incompatibility as a first-class UI condition.
- [x] Record `FcAuxCmd` as out of first-release scope until a concrete approved business workflow is defined.
- [x] Add `ClientData` / `store_ClientData` only if PSS-side backup storage is needed.

## 7) Forecourt special functions

- [x] Implement automatic polling/collection of `FcServiceMsg` when signaled.
- [x] Implement `clear_FcServiceMsg` after successful processing.
- [x] Implement `BackOfficeRecord_req` collection flow.
- [x] Support BOR variants SUBC `00H`, `01H`, and `02H` where used.
- [x] Implement `clear_BackOfficeRecord`.
- [x] Add monitoring for BOR backlog / buffer-not-empty state.
- [x] Implement `PosConnectionStatus` handling.
- [x] Surface online/offline state for peer POS/card-server/other connected apps.
- [x] Implement `PssPeripheralsStatus` handling.
- [x] Surface peripheral online/error states in diagnostics.
- [x] Decide how unknown service messages are routed or surfaced.
- [x] Add persistence/audit trail for collected service messages.
- [x] Implement `store_BackOfficeRecord` only if the product must write BORs.
- [x] Add buffering and replay guarantees for BOR processing.

## 8) Dispense control - command surface completion

- [x] Add explicit `FpStatus_req` support.
- [x] Support required `FpStatus` variants currently used by the app.
- [x] Normalize `FpMainState`, `FpSubStates`, `FpSubStates2`, `FpLockId`, `SmId`, `FcGradeId`, and supplementary status parameters.
- [x] Add `FpInfo` support.
- [x] Add `FpFuellingData` support.
- [x] Implement `open_Fp_req`.
- [x] Implement `close_Fp_req`.
- [x] Keep standard `authorize_Fp_req` support.
- [x] Add preset and extended authorization command support.
- [x] Add `prepare_Trans` support.
- [x] Keep `cancel_FpAuth_req` support.
- [x] Implement `estop_Fp`, `cancel_FpEstop`, and `reset_Fp_req` for controlled recovery paths.
- [x] Keep `clear_FpError_req` support.
- [x] Add pump error read and user-facing diagnostics.
- [x] Add pump totals command coverage: `FpGradeTotals`, `PumpGradeTotals`, and `PumpGradeBlendTotals`.
- [x] Add fallback totals read and clear command coverage.
- [x] Add admin UI controls for pump totals and fallback totals.
- [x] Add `change_FpOperationModeSet` if site workflows depend on it.
- [x] Add typed service-mode abstraction hiding raw protocol details ([implementation](src/modules/forecourt/infrastructure/jpl/dispenseAuthorization.ts), [protocol notes](docs/doms-dispense-authorization.md)).
- [ ] Finalize preset/start-limit handling against site pump behavior.
- [x] Support typed valid-grade restrictions in authorization builders while keeping site activation field-gated ([implementation](src/modules/forecourt/infrastructure/jpl/dispenseAuthorization.ts), [tests](tests/forecourt/domsDispenseAuthorization.test.ts)).
- [x] Split internal authorize flows into standard, preset, prepay, and extended domain operations ([implementation](src/modules/forecourt/infrastructure/jpl/dispenseAuthorization.ts), [protocol notes](docs/doms-dispense-authorization.md)).
- [x] Define operator/admin permissions for estop/reset features ([policy](src/modules/doms/application/domsCommandAuthorization.ts); [tests](tests/forecourt/domsCommandAuthorization.test.ts); [runbook](docs/doms-pump-alarm-recovery-runbook.md)).
- [x] Add alarm/error recovery runbooks in admin tools ([runbook](docs/doms-pump-alarm-recovery-runbook.md)).

## 9) Dispense control - transaction handling completion

- [x] Basic `FpSupTrans_req` flow exists.
- [x] Basic `clear_FpSupTrans_req` flow exists.
- [x] Unlock flow exists.
- [x] Add application services around supervised read/lock/unlock/clear.
- [x] Use returned `TransSeqNo` when clearing.
- [x] Request required `_e` fields for large transactions.
- [x] Basic `FpUnSupTrans_req` flow exists.
- [x] Basic `clear_FpUnSupTrans_req` flow exists.
- [x] Add application services around unsupervised transaction handling.
- [x] Normalize supervised and unsupervised transaction buffer status.
- [x] Add recent transaction-buffer records to workflow review UI.
- [x] Add idempotent retry rules for lock/read/clear.
- [x] Add reconciliation for stale locked supervised transactions.
- [x] Add reconciliation for stale locked unsupervised transactions.
- [x] Persist transaction processing checkpoints.
- [x] Ensure receipt/EPT data used for clear is complete and validated.
- [x] Define unattended receipt and external payment reference persistence.
- [x] Support required `00H`, `01H`, and `03H` buffer-status subcodes across solicited, unsolicited, watcher, and startup-fallback paths ([policy](src/modules/forecourt/infrastructure/jpl/transactionReplayPolicy.ts); [pass 3](docs/doms-integration-pass-3-2026-07-10.md)).
- [x] Add metrics for backlog depth, stale locks, and failed clears.

## 10) Wetstock / tank integration completion

- [x] Add `TgStatus` support.
- [x] Normalize tank state, alarms, substate bits, error state, product codes, and measurements.
- [x] Keep `TgData_req` support.
- [x] Keep `TgErrorMsg_req` support.
- [x] Implement `open_TankController` and `close_TankController`.
- [x] Implement `TankControlStatus_req`.
- [x] Implement delivery status reads.
- [x] Implement delivery data reads.
- [x] Implement `clear_TankDeliveryData_req` with protocol-aligned `ZERO` and `ID_ZERO` handling.
- [x] Add support for unsolicited delivery status.
- [x] Add delivery lifecycle commands: `mark_DeliveryStarting` and `mark_DeliveryFinished`.
- [x] Add tank block/unblock commands.
- [x] Add tank gauge clear/reset commands.
- [x] Add wetstock lifecycle controls to admin UI.
- [x] Add delivery clear checkpoints to workflow review UI.
- [x] Expand `TgData` parsing to all fields required by UI, reconciliation, and reporting.
- [x] Add typed tank error/alarm mapping.
- [x] Implement full delivery report handling beyond current delivery data snapshots.
- [x] Validate allowed dynamic tank data fields and business rules before sending changes.
- [x] Add audit logging and role-based permissions for dynamic tank data mutation.
- [ ] Field-test full end-to-end delivery lifecycle against DOMS/PSS.

## 11) Price, payment, and optional protocol modules

- [x] Decide price control is in scope.
- [x] Add `FcPriceSetStatus` support.
- [x] Add `FcPriceSet` support for current and pending price-bank reads.
- [x] Add `change_FcPriceSet` support.
- [x] Add `clear_PendingFcPriceSet` support.
- [x] Add price-bank builder/schema coverage.
- [x] Add price-bank workflow UI for current/pending price sets and clearing pending price sets.
- [x] Add local price schedule audit events to workflow overview.
- [x] Add basic price-pole command coverage for status/open/close/error/reset flows.
- [x] Decide DOMS payment/EPT control is out of first-release scope.
- [x] Add wash command-flow groundwork for status, authorize, cancel, stop/resume, error/reset.
- [x] Add optional module tracks for DIO, serial server, sensors, and vending.
- [x] Complete production UI/runtime support for price poles if a site uses them.
- [x] Complete wash transaction handling if a site uses wash control.
- [x] Complete DIO/sensor/vending runtime/API/UI only when a site requires them.
- [x] Plan EPT/payment as a separate security-focused phase with redaction and PCI-aware logging.

## 12) Configuration, commissioning, and site setup

- [x] Define DOMS host, port, TLS, `PosId`, `FcAccessCode`, country code, `PosVersionId`, unsolicited data rate, and reconnect policy in settings.
- [x] Add DOMS connection/health diagnostics in admin UI.
- [x] Document which configuration must be done in PSS Configurator instead of this app.
- [x] Add read-only DOMS/PSS configuration reconciliation.
- [x] Add reconciliation export diagnostics bundle.
- [x] Add FTC-side mapping remediation with physical/PSS confirmation.
- [x] Add mapping history and rollback.
- [x] Add dry-run DOMS maintenance planning.
- [x] Add maintenance session approval gate.
- [x] Add preview-only maintenance command envelopes.
- [x] Add final commissioning checklist for first site bring-up.
- [x] Add runbook for moving a site from simulation/legacy mode to JPL-only mode.
- [x] Add validation that settings are complete before allowing live connection.
- [x] Add bulk mapping review/apply workflow with live DOMS/PSS pre-validation.

## 13) App-level adapters and internal abstractions

- [x] Expand the command builder to cover the real operational surface, not only proof-of-connectivity commands.
- [x] Add canonical JPL type helper module.
- [x] Add central outbound preparation with schema validation and correlation IDs.
- [x] Add feature flags for protocol families under rollout.
- [x] Add application services for diagnostics, workflow overview, reconciliation, mapping remediation, maintenance plans, sessions, and command previews.
- [x] Separate raw protocol DTOs from internal domain objects across all modules.
- [x] Add stable internal APIs for connection/session lifecycle, forecourt status, pump control, transaction processing, tank monitoring, and diagnostics/admin actions.
- [x] Ensure UI workflows avoid depending on raw JPL field names.
- [x] Add typed response parsers for every command currently exposed through UI/API.

## 14) Observability and supportability

- [x] Add structured request/response logging with redaction rules.
- [x] Persist structured DOMS/JPL reject events.
- [x] Add admin diagnostics page for JPL connection, protocol health, rejects, and recent events.
- [x] Add operator-friendly DOMS health summary.
- [x] Add recent JPL protocol events to the admin UI.
- [x] Add persistent command/workflow history.
- [x] Add correlation ID filtering in workflow review UI.
- [x] Add wetstock lifecycle events.
- [x] Add mapping update, rollback, maintenance plan, maintenance session, and preview audit events.
- [x] Add exportable reconciliation diagnostics JSON.
- [x] Add per-message latency metrics.
- [x] Add counters for reconnects, missed heartbeat timeouts, rejects, transaction read failures, transaction clear failures, stale locks, service-log backlog, and BOR backlog.
- [x] Add protocol traffic sampling for difficult site issues.
- [x] Add downloadable support bundle including settings summary, recent events, rejects, and reconciliation state.
- [x] Link generated per-section TODO progress rows to their matching report sections.

## 15) Testing and validation

- [x] Add targeted tests for Tanzania route guards and local/proxy routing.
- [x] Add targeted tests for credit-note route guards.
- [x] Add JPL builder tests for protocol hardening, price-bank commands, wetstock commands, and production-module command builders.
- [x] Run `npm run build` after each generated pass in local dev environment (latest build confirmed passing after the acceptance-pack timestamp fix).
- [x] Add unit tests for every remaining request builder ([tests](tests/forecourt/domsCommandBuilderCoverage.test.ts)).
- [x] Add unit tests that dispatch every registered response parser and retain focused parser assertions ([tests](tests/forecourt/domsResponseParsers.test.ts)).
- [x] Add schema fixtures for reject messages, multi-messages, unsolicited statuses, transaction buffers, and tank data.
- [x] Add regression tests for decimal and fixed-width numeric handling ([tests](tests/forecourt/domsJplNumericTypes.test.ts)).
- [x] Build or adopt a mocked JPL server.
- [x] Add a read-only simulator validation runner for connect/logon/bootstrap and scenario workflows.
- [x] Add a one-command simulator self-test that starts/stops the local harness and emits importable field-validation evidence.
- [x] Add automatic release-gate checkpoint import for JPL session resilience evidence covering reconnect, dead-timeout, heartbeat, and transaction recovery.
- [x] Fix simulator CLI build compatibility by removing top-level await.
- [x] Ensure unsupported simulator requests return `RejectMessage_resp` instead of generic success acknowledgements.
- [x] Test connect/logon/bootstrap/reconnect ([self-test](src/modules/forecourt/infrastructure/jpl/simulatorSessionValidation.ts); [tests](tests/forecourt/domsJplSessionResilience.test.ts)).
- [x] Add regression coverage for simulator self-test startup, validation, evidence output, and shutdown.
- [x] Add regression coverage for live read-only validation profiles and safety exclusions.
- [x] Add payload-level live conformance evidence for FpStatus parser coverage and explicit money/volume decimal scaling ([implementation](src/modules/forecourt/infrastructure/jpl/liveConformance.ts); [tests](tests/forecourt/domsJplLiveConformance.test.ts); [guide](docs/doms-live-protocol-conformance.md)).
- [x] Add automatic release-gate checkpoint import for live FpStatus conformance and money/volume normalization evidence ([release-gate implementation](src/modules/forecourt/application/getDomsFieldValidationReadiness.ts); [tests](tests/forecourt/domsFieldValidationReleaseGate.test.ts); [guide](docs/doms-live-conformance-release-gate.md)).
- [x] Add live-validator regression coverage for controllers that do not echo correlation IDs on solicited responses.
- [x] Test heartbeats and dead-connection timeout handling ([policy](src/modules/forecourt/infrastructure/jpl/sessionPolicy.ts); [tests](tests/forecourt/domsJplSessionPolicy.test.ts)).
- [x] Test unsolicited status delivery.
- [x] Test transaction-buffer recovery after restart ([self-test](src/modules/forecourt/infrastructure/jpl/simulatorSessionValidation.ts); [tests](tests/forecourt/domsJplSessionResilience.test.ts)).
- [x] Test supervised/unattended transaction clearing rules.
- [x] Test correlation ID round-tripping.
- [x] Test reject-path behavior from syntax and access errors.
- [x] Test multi-message parsing and dispatch.
- [x] Validate read-only behavior against a real DOMS/PSS environment (live controller `192.168.68.123:8888`, JPL `470-02-1.10`; 17/19 checks passed, zero critical failures; [pass 6 report](docs/doms-integration-pass-6-2026-07-10.md)).
- [ ] Validate with one multi-pump site and one tank-gauge site.
- [ ] Validate reconnect behavior during network interruption.
- [ ] Validate stale-lock recovery and operator fault workflows.

## 16) Recommended implementation order

- [x] Phase 1 - transport production safety: heartbeat, timeout, reconnect, correlation ID, reject handling, and multi-message support.
- [x] Phase 2 - forecourt bootstrap and status model: `FcLogon`, access-code management, `FcStatus`, install status, and startup snapshot/reconciliation.
- [x] Phase 3 - dispense control MVP: pump open/close, richer status, authorization, reset/estop, totals, fallback totals, and transaction-buffer groundwork.
- [x] Phase 4 - wetstock MVP: tank status/data, delivery monitoring, delivery clear, lifecycle commands, block/unblock, and gauge recovery commands.
- [x] Phase 5 - operational special functions and diagnostics: service messages, BOR, POS/peripheral status, health, rejects, and command history.
- [x] Phase 6 - reconciliation and FTC-side mapping remediation.
- [x] Phase 7 - maintenance planning, approval gate, and preview-only command envelopes.
- [ ] Phase 8 - field validation against DOMS/PSS simulator and real controller.
- [x] Phase 9 - optional module productionization where required: price poles, wash, DIO, sensors, vending.
- [x] Phase 10 - defer EPT/payment from first production scope; reopen only as a separate security-focused phase when a site requirement is approved.
- [x] Phase 11 - implement the controlled PSS write execution gate with field-validation, persisted approval, role policy, target binding, one-time permit claim, replay protection, and kill switch.
  - [x] Add deny-by-default, kill-switch-protected, short-lived signed execution-permit foundation.
  - [ ] Authorize and validate the controlled write path during an approved first-site commissioning window.

## 17) Definition of done

- [x] The app can build, validate, and trace the core JPL command envelopes needed for first-release operations.
- [x] The app has admin diagnostics for connection health, recent protocol events, and structured rejects.
- [x] The app can reconcile observed DOMS devices with FTC mappings.
- [x] FTC-side mapping corrections are auditable and rollback-capable.
- [x] Future PSS write operations are guarded behind dry-run planning, approval sessions, and preview-only command envelopes.
- [ ] The app can connect, log on, stay connected, detect dead connections, and reconnect cleanly against a real target PSS.
- [ ] Required unsolicited message families are verified against a real target PSS.
- [ ] Required pump workflows work end-to-end in a real DOMS environment.
- [ ] Required transaction buffers reconcile safely across reconnects and restarts in field testing.
- [ ] Required tank workflows work end-to-end if wetstock is in scope.
- [x] Rejects, protocol faults, and site faults are observable by support without shell access.
- [ ] Configuration and commissioning guides are validated with the first deployment.
- [ ] Integration tests and field validation are complete.

## 18) DOMS/JPL reconciliation and FTC mapping remediation

- [x] Add read-only DOMS configuration reconciliation API.
- [x] Add read-only DOMS configuration reconciliation UI.
- [x] Compare FTC pumps against observed DOMS FpIds.
- [x] Compare FTC tanks against observed DOMS TankIds.
- [x] Compare FTC nozzles against DOMS grade option / grade / tank mappings.
- [x] Generate remediation suggestions.
- [x] Export reconciliation diagnostics JSON.
- [x] Apply confirmed FTC-side mapping suggestions.
- [x] Add audit logging for FTC-side DOMS mapping updates.
- [x] Add mapping history view.
- [x] Add rollback support for FTC-side mapping changes.
- [x] Add audit logging for mapping rollback.
- [x] Add bulk mapping review/apply workflow.
- [x] Add CSV/JSON import for approved FTC mapping corrections.
- [x] Add field validation against live DOMS/PSS before permitting bulk apply.

## 19) DOMS/PSS maintenance planning and approval gate

- [x] Add dry-run DOMS maintenance plan endpoint.
- [x] Add DOMS maintenance plan UI.
- [x] Record administrator review of a maintenance plan.
- [x] Add maintenance session request/approval/cancel workflow.
- [x] Add session expiry and duplicate-session guardrails.
- [x] Add maintenance command preview endpoint.
- [x] Add preview UI for non-executing JPL maintenance envelopes.
- [x] Preview `FcInstallStatus_req`.
- [x] Preview `FpStatus_req` with `FpId=00`.
- [x] Preview `TgStatus_req` with `TgId=00`.
- [x] Preview `clear_InstallData_req` candidates.
- [x] Preview `install_Fp_req` SUBC `03H` candidates.
- [x] Add actual maintenance execution gate.
- [x] Add final operator confirmation before any PSS write command ([implementation](src/modules/forecourt/application/confirmDomsMaintenanceCommand.ts); [API](app/api/admin/forecourt/maintenance/final-confirmation/route.ts); [tests](tests/forecourt/domsMaintenanceFinalConfirmation.test.ts); [notes](docs/doms-maintenance-final-confirmation.md)).
- [x] Add command-by-command dry-run-to-execute comparison ([implementation](src/modules/forecourt/application/compareDomsMaintenanceCommand.ts); [API](app/api/admin/forecourt/maintenance/compare/route.ts); [tests](tests/forecourt/domsMaintenanceCommandComparison.test.ts); [notes](docs/doms-maintenance-command-comparison.md)).
- [x] Add hard disable switch for all PSS write operations.
- [x] Add field engineer role requirement for PSS write execution ([role type](src/shared/types/index.ts); [route guard](app/api/admin/forecourt/maintenance/final-confirmation/route.ts); [migration](scripts/migrations/postgres/1251_field_engineer_role.sql)).
- [x] Add a database-backed, one-time permit command-transmission adapter with replay protection, target binding, digest verification, and success/failure audit evidence ([implementation](src/modules/forecourt/application/executeDomsMaintenanceCommand.ts); [JPL adapter](src/modules/forecourt/infrastructure/jpl/maintenanceExecution.ts); [API](app/api/admin/forecourt/maintenance/execute/route.ts); [tests](tests/forecourt/domsMaintenanceCommandExecution.test.ts); [notes](docs/doms-maintenance-command-execution.md)).
- [x] Bind execution permits to a persisted current deployment approval instead of client-supplied checkpoint assertions ([sign-off repository](src/modules/forecourt/infrastructure/domsDeploymentSignOffRepo.ts); [permit service](src/modules/forecourt/application/domsMaintenanceExecutionPermit.ts); [migration](scripts/migrations/postgres/1253_doms_deployment_sign_offs.sql); [tests](tests/forecourt/domsMaintenanceExecutionPermit.test.ts); [guide](docs/doms-database-backed-deployment-approval.md)).

## 20) Tanzania fiscalization routing

- [x] Add DB-backed fiscalization transport setting.
- [x] Add Tanzania local/proxy safety switch in UI.
- [x] Guard proxy worker from claiming Tanzania `local_tz` transactions.
- [x] Guard local worker from claiming proxy-routed transactions.
- [x] Support local Tanzania fiscalization for sales.
- [x] Support local Tanzania fiscalization for credit notes.
- [x] Add Tanzania fiscalization route tests.
- [x] Keep `.env` behavior limited to developer testing and avoid relying on shipped env files.
- [ ] Validate TRA sale submission against a real endpoint.
- [ ] Validate TRA credit-note/reversal submission against a real endpoint.
- [ ] Validate EWURA submission and retry behavior.
- [ ] Confirm negative-value credit-note reversal documents are accepted by Tanzania endpoints.
- [x] Add cloud cutover checklist.
- [x] Add route-switch queue safety checks before switching local/proxy.

## 21) Build, release, and field validation

- [x] Add field validation readiness endpoint.
- [x] Add field validation readiness UI.
- [x] Add exportable field validation readiness JSON.
- [x] Add audit checkpoint recording for manual validation evidence.
- [x] Add consolidated release-evidence runner for build, tests, JPL protocol, simulator self-test, simulator validation, and TODO regeneration ([script](scripts/doms-release-evidence.js); [classification](docs/doms-remaining-work-classification.md)).
- [x] Add machine-readable remaining-work classification separating code, local validation, field validation, external endpoints, organizational approval, and deferred scope ([JSON](DOMS_REMAINING_WORK.json)).
- [x] Run `npm run build` on the latest package after applying this TODO refresh (confirmed passing by local validation).
- [x] Run `npm run test` (confirmed passing by local validation).
- [x] Run JPL protocol tests (confirmed passing by local validation).
- [ ] Test against DOMS/PSS simulator.
- [x] Test read-only profiles against a real DOMS/PSS controller (live evidence captured; write-path acceptance remains open).
- [ ] Validate pump workflows on a multi-pump site.
- [ ] Validate wetstock workflows on a site with tank gauges.
- [ ] Validate reconciliation against PSS Configurator output.
- [ ] Validate Tanzania fiscalization with real TRA/EWURA credentials.
- [ ] Record deployment acceptance notes after first site validation.
- [x] Reconcile validation checkpoint evidence with final deployment sign-off ([implementation](src/modules/forecourt/application/recordDomsDeploymentSignOff.ts); [API](app/api/admin/forecourt/field-validation/sign-off/route.ts); [documentation](docs/doms-deployment-sign-off.md)).
- [x] Add automated release gate once build/test results are machine-recorded.
- [x] Add simulator evidence import once DOMS/PSS simulator output is standardized.
- [x] Add read-only simulator evidence runner output shaped for the field-validation import panel.
- [x] Add self-contained simulator evidence generation for local development and package handoff.
- [x] Add a live DOMS/PSS read-only validation runner that excludes transaction-buffer reads and all PSS write commands.
  - Pass 5 aligned live probes with protocol request variants and added bounded malformed-frame diagnostics ([pass report](docs/doms-integration-pass-5-2026-07-10.md)).
  - Pass 6 accepted protocol-valid unsolicited startup status as evidence for status services that do not reply to a duplicate solicited read, and recorded successful live-controller validation with zero critical failures ([pass report](docs/doms-integration-pass-6-2026-07-10.md)).

- [x] Generate a deterministic first-site acceptance pack with evidence ownership, immutable criteria digest, and digest-bound deployment sign-off ([builder](src/modules/forecourt/application/domsFirstSiteAcceptancePack.ts); [service](src/modules/forecourt/application/getDomsFirstSiteAcceptancePack.ts); [API](app/api/admin/forecourt/field-validation/acceptance-pack/route.ts); [tests](tests/forecourt/domsFirstSiteAcceptancePack.test.ts); [guide](docs/doms-first-site-acceptance-pack.md)).

## 22) Remaining work classification

The first-production DOMS/JPL scope has **no open core code implementation tasks**. Remaining unchecked items are intentionally external to implementation and are tracked in [`DOMS_REMAINING_WORK.json`](DOMS_REMAINING_WORK.json).

| Classification               | Status                              | Examples                                                                                                                                |
| ---------------------------- | ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Core code implementation     | Complete                            | Dispense, wetstock, persistence, reconciliation, diagnostics, maintenance approval, and one-time controlled execution                   |
| Local verification           | Pending final evidence run          | Simulator self-test and simulator validation through `npm run doms:release:evidence`                                                    |
| Field validation             | Requires real controller/site       | Live scaling, full `FpStatus`, pump/tank workflows, reconnect, stale locks, Configurator reconciliation, controlled write commissioning |
| External endpoint validation | Requires TRA/EWURA                  | Sale, credit note, retry, reversal acceptance, live parity                                                                              |
| Organizational approval      | Requires accountable people         | Field/support expectations, first-site criteria, deployment sign-off                                                                    |
| Deferred scope               | Explicitly closed for first release | EPT/payment, `FcAuxCmd`, evidence-driven extra `FcStatus` variants                                                                      |

See [`docs/doms-remaining-work-classification.md`](docs/doms-remaining-work-classification.md) for the execution plan.

## 23) vpos-fiscal-tz feature parity inside FTC

Status note: the full `vpos-fiscal-tz` package is **not** currently built into `vpos-ftc-app`. The FTC app has FTC-native Tanzania routing, local sale fiscalization, and local credit-note fiscalization, but the original package still contains additional TRA/EWURA engine, queue, registration, report, signing, simulator, and artifact-management behavior that must be ported or deliberately replaced before we can claim full feature parity.

- [x] Confirm `vpos-fiscal-tz` must not be added as a runtime dependency of `vpos-ftc-app`.
- [x] Implement FTC-native Tanzania local/proxy fiscalization route selection.
- [x] Keep production behavior DB/settings-driven instead of relying on shipped `.env` files.
- [x] Guard proxy workers from claiming Tanzania `local_tz` sales.
- [x] Guard local workers from claiming proxy-routed sales.
- [x] Implement FTC-native local Tanzania sale fiscalization path.
- [x] Implement FTC-native local Tanzania credit-note/reversal fiscalization path.
- [x] Persist local Tanzania fiscalization responses for audit/retry visibility.
- [x] Add tests for Tanzania route guards and local/proxy dispatch.
- [x] Create a formal `vpos-fiscal-tz` parity matrix covering TRA, EWURA, queues, reports, config artifacts, certificates, signing, simulators, and printer/output behavior.
- [x] Port or replace TRA token/authentication request behavior from `src/tra/messages/tokenRequest.ts` and related payload utilities.
- [x] Port or replace TRA registration request/response handling from `registrationRequest`, `registrationPayloadRequest`, and registration interfaces.
- [x] Port or replace TRA verification/status request behavior where required by Tanzania operations.
- [x] Port or replace the full TRA receipt payload builder, including item records, payment records, VAT totals, totals, change records, VFD fields, and serialization/signing semantics.
- [x] Port or replace TRA z-report request/response support, including z-report totals and daily close behavior.
- [x] Map `vpos-fiscal-tz` file/JSON queues to FTC database-backed queues, including transaction queue, report queue, retry state, archived transactions, and archived reports.
- [x] Map `fiscal.config.json`, `fiscal.device.json`, `fiscal.registration.json`, and token/device artifacts into FTC settings, secure artifacts, or database tables.
- [x] Port or replace certificate and signing utilities from the TRA/EWURA modules using FTC secure artifact storage.
- [x] Port or replace EWURA official config, certificate utilities, transaction queues, report queues, and EFPP integration behavior.
- [x] Implement explicit EWURA retry/reconciliation semantics for sale and credit-note flows.
- [x] Confirm whether EWURA failures should block the transaction, mark partial fiscalization, or retry asynchronously.
- [x] Port or replace fiscal printer / receipt printer / registration printer / z-report printer output behavior if physical or PDF fiscal receipts are in scope.
- [x] Port or replace simulator/demo behavior needed for developer and field validation without live TRA/EWURA endpoints.
- [x] Compare FTC-generated TRA XML against the `vpos-fiscal-tz` XML templates and example payloads.
- [x] Compare FTC-generated EWURA payloads against the official EWURA examples/assets from `vpos-fiscal-tz`.
- [x] Validate receipt counters, global counters, daily counters, fiscal day boundaries, z-report resets, and retry idempotency against `vpos-fiscal-tz` behavior.
- [ ] Validate sale fiscalization against real TRA/EWURA endpoints.
- [ ] Validate credit-note/reversal fiscalization against real TRA/EWURA endpoints.
- [x] Document intentional differences where FTC replaces file-based `vpos-fiscal-tz` behavior with database-backed services.
