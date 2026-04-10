# DOMS Integration Todo List

**Overall Progress: 35%** (97 / 281 tasks completed)

### Per-Section Progress

| Section | Completed | Total | Progress |
|---------|-----------|-------|----------|
| **1) Finalize scope and integration contract** | 0 | 9 | ░░░░░░░░░░░░░░░░░░░░ 0% |
| **2) Transport, session, and connection management** | 5 | 14 | ███████░░░░░░░░░░░░░ 36% |
| **3) Core protocol envelope handling** | 11 | 13 | █████████████████░░░ 85% |
| **4) Forecourt logon and bootstrap** | 9 | 19 | █████████░░░░░░░░░░░ 47% |
| **5) Current functionality already present - verify and harden** | 15 | 22 | █████████████░░░░░░░ 68% |
| **6) General forecourt controller functions** | 6 | 15 | ████████░░░░░░░░░░░░ 40% |
| **7) Forecourt special functions** | 13 | 20 | █████████████░░░░░░░ 65% |
| **8) Dispense control - command surface completion** | 19 | 32 | ███████████░░░░░░░░░ 59% |
| **9) Dispense control - transaction handling completion** | 13 | 21 | ████████████░░░░░░░░ 62% |
| **10) Wetstock / tank integration completion** | 6 | 17 | ███████░░░░░░░░░░░░░ 35% |
| **11) Price, payment, and other optional modules** | 0 | 22 | ░░░░░░░░░░░░░░░░░░░░ 0% |
| **12) Configuration, commissioning, and site setup** | 0 | 16 | ░░░░░░░░░░░░░░░░░░░░ 0% |
| **13) App-level adapters and internal abstractions** | 0 | 11 | ░░░░░░░░░░░░░░░░░░░░ 0% |
| **14) Observability and supportability** | 0 | 14 | ░░░░░░░░░░░░░░░░░░░░ 0% |
| **15) Testing and validation** | 0 | 19 | ░░░░░░░░░░░░░░░░░░░░ 0% |
| **16) Recommended implementation order** | 0 | 9 | ░░░░░░░░░░░░░░░░░░░░ 0% |
| **17) Definition of done** | 0 | 8 | ░░░░░░░░░░░░░░░░░░░░ 0% |


---

*Last updated: April 10, 2026 at 03:50 PM*

This checklist is organized around what the current codebase already appears to support through `@gilbarcoafs/doms-pos-jpl`, and what still needs to be added to complete a production-grade DOMS integration.

## 1) Finalize scope and integration contract

- [ ] Confirm the first-release scope for DOMS integration:
  - [ ] Dispense control only
  - [ ] Dispense + wetstock/tanks
  - [ ] Dispense + wetstock + payment control
  - [ ] Optional modules: price poles, wash, digital I/O, serial server, sensors, vending
- [ ] Confirm which protocol features are mandatory for go-live vs later phases.
- [ ] Confirm whether secure JPL/TLS is mandatory in the target environments.
- [ ] Confirm station commissioning expectations: which parts are configured in PSS Configurator vs installed dynamically from the app.
- [ ] Document the supported PSS/JPL version floor for the integration.

## 2) Transport, session, and connection management

- [ ] Add explicit support for selecting the correct JPL TCP port:
  - [ ] 8888 for unencrypted
  - [ ] 8889 for TLS
- [ ] Expose secure-mode configuration cleanly from app settings to the DOMS client bootstrap.
- [ ] Add support for client certificate / secure connectivity requirements if the target PSS deployment requires them.
- [x] Validate the server `jpl` welcome/version response and surface unsupported-version diagnostics.
- [ ] Implement or verify permanent socket keepalive behavior.
- [x] Implement client heartbeat scheduling.
- [x] Enforce connection-dead detection when no message arrives within the protocol timeout window.
- [ ] Implement reconnect with backoff and clean session re-bootstrap.
- [ ] Ensure reconnect always re-runs logon, unsolicited subscriptions, status update mode, and startup reconciliation.
- [x] Add explicit online/offline lifecycle events for the rest of the app.
- [ ] Add framing-level validation and logging for STX/ETX protocol boundaries.
- [x] Add connection health metrics and structured logs.

## 3) Core protocol envelope handling

- [ ] Normalize all incoming JPL messages by `name`, `subCode`, `solicited`, and `data`.
- [ ] Make request serialization strictly case-sensitive for `name` and `subCode`.
- [x] Add correlation ID support end-to-end for every request.
- [x] Preserve correlation IDs through request/response mapping and logs.
- [x] Add a generic `RejectMessage_resp` handler.
- [x] Map reject reasons into typed application errors:
  - [x] unknown message code
  - [x] syntax error
  - [x] access error
  - [x] invalid state / business rule rejection
- [x] Surface `RejectInfo` / `RejectInfoText` in logs and adapter state diagnostics.
- [x] Fully support `MultiMessage_resp` dispatch across subscribed message families.
- [x] Add protocol fixtures covering single-message and multi-message parsing.

## 4) Forecourt logon and bootstrap

- [x] Centralize `FcLogon` request construction.
- [x] Centralize `FcAccessCode` composition.
- [x] Ensure `RI` is always present unless intentionally disabled.
- [x] Ensure required unsolicited feature flags are configurable, not hard-coded.
- [ ] Review and support all needed access-code flags, including:
  - [ ] `UNSO_FPSTA_3`
  - [ ] `UNSO_FPSTA_3:MFDR=nn`
  - [ ] `UNSO_TRBUFSTA_3`
  - [ ] `UNSO_INSTSTA_1` / `UNSO_INSTSTA_2`
  - [ ] `UNSO_TGSTA_1` / `UNSO_TGSTA_2`
  - [ ] `UNSO_DELIVSTA_1`
  - [ ] `UNSO_PRISTA_1`
- [x] Make Max Fuelling Data Rate configurable in settings.
- [x] Validate `PosId` rules at startup.
- [ ] Enforce unique `PosId` per client/session.
- [x] Prevent `PosId=00` from being assigned to a real POS client.
- [ ] Define a crash-recovery strategy for locks/transactions that may require `ID_ZERO` handling.
- [x] Run `change_FcStatusUpdateMode` as part of bootstrap when required.
- [x] Add a single startup reconciliation flow that gathers the minimum viable site snapshot.

## 5) Current functionality already present - verify and harden

- [x] JPL/TCP lifecycle bootstrap exists.
- [x] Forecourt logon exists.
- [x] Access-code enrichment for unsolicited pump status / transaction buffer status exists.
- [x] Unsolicited `FpStatus_resp` handling exists.
- [x] Transaction buffer watcher exists.
- [x] Startup reconciliation for transaction buffers exists.
- [x] Minimal command mapping exists for:
  - [x] standard `authorize_Fp`
  - [x] `cancel_FpAuth`
  - [x] `clear_FpError`
- [x] Basic tank operations exist for:
  - [x] `TgData_req`
  - [x] `change_DynamicTankData_req`
  - [x] `TgErrorMsg_req`

### Hardening items for the existing functionality

- [x] Add request/response schema validation for every currently supported command.
- [ ] Add exhaustive tests for the current command builders.
- [ ] Confirm decimal, money, and volume normalization is correct for all current responses.
- [ ] Confirm unsolicited `FpStatus` parsing covers all fields used by the UI and workflows.
- [ ] Confirm `MultiMessage_resp` works for unsolicited pump statuses and buffer statuses.
- [ ] Confirm transaction replay/recovery is idempotent across reconnects and restarts.
- [ ] Confirm watcher behavior when buffers are empty, locked, stale, or racing with another POS.
- [ ] Confirm logs include correlation IDs and DOMS reject details for all current commands.

## 6) General forecourt controller functions

- [x] Add a proper API layer for `FcStatus`.
- [ ] Add support for the required `FcStatus` subcodes used by the product.
- [x] Map `FcStatus1Flags` and `FcStatus2Flags` into typed internal state.
- [ ] Surface controller-level conditions such as:
  - [x] service message ready
  - [x] back office record exists
  - [x] RTC error
  - [ ] hardware/software incompatibility
  - [x] fallback mode / stored transaction restrictions
- [ ] Add `FcInstallStatus` read + unsolicited handling.
- [ ] Add `FcPriceSetStatus` read + unsolicited handling if price control is in scope.
- [ ] Add `FcOperationModeStatus` read + change handling if needed.
- [ ] Add `FcDateAndTime` read support.
- [ ] Add `change_FcDateAndTime` support if clock sync is part of commissioning/ops.
- [ ] Add `FcAuxCmd` support only if there is a known business need.

## 7) Forecourt special functions

### Service log

- [x] Implement automatic polling/collection of `FcServiceMsg` when service-log-ready is signaled.
- [x] Implement `clear_FcServiceMsg` after successful processing.
- [ ] Decide how unknown service messages are routed or surfaced.
- [ ] Add persistence / audit trail for collected service messages.

### Back office records

- [x] Implement `BackOfficeRecord_req` collection flow.
- [x] Decide which `BackOfficeRecord` subcode variant is used by the target PSS application.
- [ ] Implement support for the chosen BOR variant(s):
  - [x] SUBC `00H`
  - [x] SUBC `01H`
  - [x] SUBC `02H`
- [x] Implement `clear_BackOfficeRecord`.
- [ ] Implement `store_BackOfficeRecord` only if the product needs to write BORs.
- [ ] Add buffering, persistence, and replay guarantees for BOR processing.
- [x] Add monitoring for BOR backlog / buffer-not-empty state.

### POS connection status and peripherals

- [x] Implement `PosConnectionStatus` handling.
- [x] Surface online/offline status for peer POS / card server / other connected applications.
- [x] Implement `PssPeripheralsStatus` handling.
- [x] Surface peripheral online/error states in diagnostics.

### Client data backup

- [ ] Implement `ClientData` / `store_ClientData` only if this app needs PSS-side backup storage.
- [ ] Define ownership and format of any client backup payloads before implementing.

## 8) Dispense control - command surface completion

### Pump status and state reads

- [x] Add explicit `FpStatus_req` support.
- [ ] Support the required `FpStatus` variants:
  - [x] SUBC `00H`
  - [x] SUBC `01H` if needed
  - [x] SUBC `03H`
- [x] Normalize `FpMainState`, `FpSubStates`, `FpSubStates2`, `FpLockId`, `SmId`, `FcGradeId`, and supplementary status parameters.
- [x] Add `FpInfo` support if required by the UI or business workflows.
- [x] Add `FpFuellingData` support if live fuelling data is required.

### Pump open/close and service modes

- [x] Implement `open_Fp_req`.
- [x] Implement `close_Fp_req`.
- [ ] Add `change_FpOperationModeSet` / operation-mode support if site workflows depend on it.
- [ ] Add a typed service-mode abstraction that hides raw protocol details from the rest of the app.

### Authorization flows

- [x] Keep standard `authorize_Fp_req` support.
- [x] Add `authorize_Fp` SUBC `01H` for preset authorizations.
- [x] Add `authorize_Fp` SUBC `02H` for extended/special authorizations.
- [ ] Support preset types and start limits consistently.
- [ ] Support valid-grade restrictions if required by site/pump behavior.
- [x] Add `prepare_Trans` support if prepay setup requires it.
- [ ] Add a clear internal distinction between:
  - [ ] standard authorize
  - [ ] preset authorize
  - [ ] prepay / prepare transaction
  - [ ] extended authorize

### Cancellation, estop, and reset

- [x] Keep `cancel_FpAuth_req` support.
- [x] Implement `cancel_FpEstop` if emergency-stop release is needed.
- [x] Implement `estop_Fp` if emergency-stop activation is needed from the app.
- [x] Implement `reset_Fp_req` for controlled recovery paths.
- [ ] Define operator/admin permissions for estop/reset features.

### Error handling

- [x] Keep `clear_FpError_req` support.
- [x] Add `FpError` read flow if detailed error diagnostics are needed.
- [ ] Map pump error codes into user-facing diagnostics.
- [ ] Add alarm/error recovery runbooks in the admin tools.

## 9) Dispense control - transaction handling completion

### Supervised transactions

- [x] Basic `FpSupTrans_req` flow exists in replay logic.
- [x] Basic `clear_FpSupTrans_req` flow exists in replay logic.
- [x] Unlock flow exists.
- [x] Add explicit application services around supervised transaction read/lock/unlock/clear.
- [x] Ensure the app always uses the returned `TransSeqNo` when clearing.
- [x] Ensure transaction parameter lists request all required `_e` fields for large transactions.
- [ ] Add idempotent retry rules for lock/read/clear.
- [ ] Add reconciliation for stale locked supervised transactions.
- [ ] Persist transaction processing checkpoints.

### Unsupervised transactions

- [x] Basic `FpUnSupTrans_req` flow exists in replay logic.
- [x] Basic `clear_FpUnSupTrans_req` flow exists in replay logic.
- [x] Add explicit application services around unsupervised transaction handling.
- [ ] Ensure receipt / EPT data used for clear is complete and validated.
- [ ] Add reconciliation for stale locked unsupervised transactions.
- [ ] Define how unattended receipts and external payment references are persisted.

### Transaction buffer status

- [x] Transaction buffer watcher exists.
- [x] Add a normalized internal model for:
  - [x] supervised transaction buffer status
  - [x] unsupervised transaction buffer status
- [ ] Support all required buffer-status subcodes and unsolicited variants.
- [ ] Add metrics for backlog depth, stale locks, and failed clears.

## 10) Wetstock / tank integration completion

### Tank status and reads

- [x] Add `TgStatus` support.
- [x] Normalize tank state, alarms, substate bits, error state, product codes, and measurements.
- [ ] Keep `TgData_req` support.
- [ ] Expand `TgData` parsing to all fields required by the UI, reconciliation, and reporting.
- [ ] Keep `TgErrorMsg_req` support.
- [ ] Add typed tank error/alarm mapping.

### Dynamic tank data changes

- [x] `change_DynamicTankData_req` exists.
- [ ] Validate allowed fields and business rules before sending changes.
- [ ] Add audit logging for dynamic tank data changes.
- [ ] Add role-based permissions for tank data mutation.

### Tank control and delivery monitoring

- [ ] Implement `open_TankController` / `close_TankController` if site operations require it.
- [x] Implement delivery status reads.
- [x] Implement delivery data reads.
- [ ] Implement delivery report handling.
- [x] Implement `clear_TankDeliveryData_req`.
- [ ] Add support for unsolicited delivery status if needed.
- [ ] Add end-to-end workflows for delivery lifecycle handling.

## 11) Price, payment, and other optional modules

### Price control

- [ ] Decide whether price-pole and forecourt price-set control are in scope.
- [ ] If yes, implement:
  - [ ] `FcPriceSetStatus`
  - [ ] `change_FcPriceSet`
  - [ ] `PpStatus`
  - [ ] `open_Pp` / `close_Pp`
  - [ ] price-pole error read/reset flows

### Payment control

- [ ] Decide whether DOMS payment control is in scope or whether payments remain external.
- [ ] If yes, implement the minimum viable payment-control surface:
  - [ ] POS operator status
  - [ ] card server status
  - [ ] EPT status
  - [ ] card validation status
  - [ ] card track data collection
  - [ ] card acceptance
  - [ ] payment sequence accept/cancel
  - [ ] terminal error read/clear/reset
  - [ ] receipt / sequence data extraction

### Wash control

- [ ] Decide whether wash control is in scope.
- [ ] If yes, implement wash point status, authorize, cancel, stop/resume, transaction handling, and error/reset flows.

### Digital I/O, serial server, sensors, vending

- [ ] Confirm whether any of these are actually needed.
- [ ] If yes, create separate implementation tracks for each protocol family.

## 12) Configuration, commissioning, and site setup

- [ ] Define the complete DOMS configuration model in app settings:
  - [ ] host
  - [ ] port
  - [ ] TLS on/off
  - [ ] `PosId`
  - [ ] `FcAccessCode`
  - [ ] country code
  - [ ] `PosVersionId`
  - [ ] unsolicited data rate settings
  - [ ] reconnect policy
  - [ ] tracing level
- [ ] Validate settings before allowing connection.
- [ ] Add a DOMS connection test / health check action in the admin UI.
- [ ] Add a commissioning checklist for first site bring-up.
- [ ] Document which configuration must be done in PSS Configurator instead of this app.
- [ ] Add a runbook for moving a site from simulation/legacy mode to JPL-only mode.

## 13) App-level adapters and internal abstractions

- [ ] Expand the current command builder so it covers the real operational surface, not just the minimal proof-of-connectivity commands.
- [ ] Separate raw protocol DTOs from internal domain objects.
- [ ] Add a stable internal API for:
  - [ ] connection/session lifecycle
  - [ ] forecourt status
  - [ ] pump control
  - [ ] transaction processing
  - [ ] tank monitoring
  - [ ] diagnostics/admin actions
- [ ] Ensure the UI and workflows do not depend on raw JPL field names.
- [ ] Add feature flags for protocol families still under rollout.

## 14) Observability and supportability

- [ ] Add structured request/response logging with redaction rules.
- [ ] Add per-message latency metrics.
- [ ] Add counters for:
  - [ ] reconnects
  - [ ] missed heartbeat timeouts
  - [ ] reject messages
  - [ ] transaction read failures
  - [ ] transaction clear failures
  - [ ] stale locks
  - [ ] service log backlog
  - [ ] BOR backlog
- [ ] Add protocol traffic sampling for debugging difficult site issues.
- [ ] Add a diagnostic page showing last inbound/outbound DOMS messages.
- [ ] Add an operator-friendly DOMS health summary.

## 15) Testing and validation

### Unit and contract tests

- [ ] Add unit tests for every request builder.
- [ ] Add unit tests for every response parser.
- [ ] Add schema fixtures for reject messages, multi-messages, unsolicited statuses, transaction buffers, and tank data.
- [ ] Add regression tests for decimal and fixed-width numeric handling.

### Integration tests

- [ ] Build or adopt a mocked JPL server.
- [ ] Test connect/logon/bootstrap/reconnect.
- [ ] Test heartbeats and dead-connection timeout handling.
- [ ] Test unsolicited status delivery.
- [ ] Test transaction-buffer recovery after restart.
- [ ] Test supervised/unattended transaction clearing rules.
- [ ] Test correlation ID round-tripping.
- [ ] Test reject-path behavior from both syntax and access errors.
- [ ] Test multi-message parsing and dispatch.

### Site acceptance / field validation

- [ ] Validate behavior against a real DOMS/PSS environment.
- [ ] Validate with at least one site that has multiple pumps.
- [ ] Validate with at least one site that has tank gauges.
- [ ] Validate reconnect behavior during network interruption.
- [ ] Validate stale-lock recovery.
- [ ] Validate operator workflows for common faults.

## 16) Recommended implementation order

### Phase 1 - make the transport production-safe

- [ ] Finish heartbeat, timeout, reconnect, correlation ID, reject handling, and multi-message support.

### Phase 2 - finish the forecourt bootstrap and status model

- [ ] Finish `FcLogon`, access-code management, `FcStatus`, install status, and startup snapshot/reconciliation.

### Phase 3 - complete dispense control MVP

- [ ] Add `open_Fp`, `close_Fp`, richer `FpStatus`, preset/extended authorization, reset/estop flows, and hardened supervised/unsupervised transaction handling.

### Phase 4 - complete wetstock MVP

- [ ] Add `TgStatus`, stronger `TgData` modeling, delivery monitoring, and `clear_TankDeliveryData`.

### Phase 5 - add special functions needed for operations

- [ ] Add `FcServiceMsg`, `BackOfficeRecord`, `PosConnectionStatus`, and `PssPeripheralsStatus`.

### Phase 6 - add optional protocol families only if the business needs them

- [ ] Price
- [ ] Payment control
- [ ] Wash
- [ ] DIO / serial / sensors / vending

## 17) Definition of done

- [ ] The app can connect, log on, stay connected, detect dead connections, and reconnect cleanly.
- [ ] Required unsolicited message families are subscribed and handled correctly.
- [ ] Required pump workflows work end-to-end in a real DOMS environment.
- [ ] Required transaction buffers are reconciled safely across reconnects and restarts.
- [ ] Required tank workflows work end-to-end if wetstock is in scope.
- [ ] Rejects, protocol faults, and site faults are observable and diagnosable.
- [ ] Configuration and commissioning are documented.
- [ ] Integration tests and field validation are complete.
