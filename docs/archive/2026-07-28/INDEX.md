# Documentation Index

This index identifies the current authoritative documents. Implementation pass notes belong in the consolidated history files rather than separate documents.

## Start here

- [`../README.md`](../README.md) — project overview, local setup, scripts, and runtime capabilities.
- [`ARCHITECTURE.md`](ARCHITECTURE.md) — system structure, module boundaries, and runtime architecture.
- [`STARTUP_FLOW.md`](STARTUP_FLOW.md) — startup and runtime composition sequence.
- [`TESTING.md`](TESTING.md) — suite discovery, private dependency policy, coverage baseline, commands, and test-writing rules.
- [`DATA_STORAGE_REDUCTION_PLAN.md`](DATA_STORAGE_REDUCTION_PLAN.md) — verified data ownership, retention, and storage-consolidation plan.
- [`CONFIGURATION_OWNERSHIP.md`](CONFIGURATION_OWNERSHIP.md) — canonical configuration owners, station KV policy, environment precedence, and retirement audit.
- [`CONFIGURATION_STORAGE_RETIREMENT.md`](CONFIGURATION_STORAGE_RETIREMENT.md) — maintenance-window preflight, explicit retirement command, post-check, audit trail, and compatibility-shell restore.
- [`COUNTRY_CATALOG_OWNERSHIP.md`](COUNTRY_CATALOG_OWNERSHIP.md) — canonical country catalog storage, runtime scope, hashes, compatibility views, and retirement gates.
- [`CONFIGURATION_HISTORY_AND_PSS_STORAGE.md`](CONFIGURATION_HISTORY_AND_PSS_STORAGE.md) — configuration-version hashing, pinning and retention, plus canonical PSS XML storage and parsed-copy retirement.

## Current work and implementation history

- [`../DOMS_INTEGRATION_TODO.md`](../DOMS_INTEGRATION_TODO.md) — current DOMS/JPL implementation and validation checklist.
- [`../DOMS_REMAINING_WORK.json`](../DOMS_REMAINING_WORK.json) — machine-readable remaining validation and approval work.
- [`DOMS_INTEGRATION_HISTORY.md`](DOMS_INTEGRATION_HISTORY.md) — consolidated DOMS implementation pass history.
- [`REFACTOR_PASS_HISTORY.md`](REFACTOR_PASS_HISTORY.md) — consolidated general refactor pass history.
- [`doms-remaining-work-classification.md`](doms-remaining-work-classification.md) — interpretation of the remaining-work categories.
- [`doms-progress-report-generator.md`](doms-progress-report-generator.md) — TODO progress generator behavior.

## DOMS commissioning and operations

- [`doms-commissioning-readiness.md`](doms-commissioning-readiness.md)
- [`doms-operational-readiness.md`](doms-operational-readiness.md)
- [`doms-first-site-acceptance-pack.md`](doms-first-site-acceptance-pack.md)
- [`doms-field-validation-release-gate.md`](doms-field-validation-release-gate.md)
- [`doms-database-backed-deployment-approval.md`](doms-database-backed-deployment-approval.md)
- [`doms-deployment-sign-off.md`](doms-deployment-sign-off.md)
- [`doms-live-conformance-release-gate.md`](doms-live-conformance-release-gate.md)
- [`doms-live-protocol-conformance.md`](doms-live-protocol-conformance.md)
- [`doms-live-readonly-validation.md`](doms-live-readonly-validation.md)
- [`doms-jpl-mutual-tls.md`](doms-jpl-mutual-tls.md)
- [`doms-jpl-simulator-harness.md`](doms-jpl-simulator-harness.md)
- [`doms-simulator-validation-runner.md`](doms-simulator-validation-runner.md)
- [`doms-simulator-self-test.md`](doms-simulator-self-test.md)
- [`doms-phase-8-resilience-evidence.md`](doms-phase-8-resilience-evidence.md)

## DOMS transaction, pump, and wetstock behavior

- [`doms-transaction-recovery.md`](doms-transaction-recovery.md)
- [`doms-dispense-authorization.md`](doms-dispense-authorization.md)
- [`doms-pump-alarm-recovery-runbook.md`](doms-pump-alarm-recovery-runbook.md)
- [`doms-domain-response-parsers.md`](doms-domain-response-parsers.md)
- [`doms-dynamic-tank-data-governance.md`](doms-dynamic-tank-data-governance.md)
- [`doms-wetstock-normalization.md`](doms-wetstock-normalization.md)
- [`doms-unattended-receipt-capture.md`](doms-unattended-receipt-capture.md)
- [`doms-wash-transaction-capture.md`](doms-wash-transaction-capture.md)
- [`doms-special-record-processing.md`](doms-special-record-processing.md)
- [`doms-optional-module-runtime.md`](doms-optional-module-runtime.md)
- [`doms-posid-session-leases.md`](doms-posid-session-leases.md)
- [`doms-mapping-bulk-remediation.md`](doms-mapping-bulk-remediation.md)
- [`doms-support-bundle.md`](doms-support-bundle.md)

## DOMS controlled maintenance

- [`doms-maintenance-command-comparison.md`](doms-maintenance-command-comparison.md)
- [`doms-maintenance-command-execution.md`](doms-maintenance-command-execution.md)
- [`doms-maintenance-execution-permit.md`](doms-maintenance-execution-permit.md)
- [`doms-maintenance-final-confirmation.md`](doms-maintenance-final-confirmation.md)

## Tanzania fiscalization

- [`tanzania-fiscalization-routing.md`](tanzania-fiscalization-routing.md)
- [`tanzania-fiscalization-parity-matrix.md`](tanzania-fiscalization-parity-matrix.md)
- [`tanzania-parity-validation.md`](tanzania-parity-validation.md)
- [`tanzania-secure-artifacts.md`](tanzania-secure-artifacts.md)
- [`tanzania-output-simulator.md`](tanzania-output-simulator.md)
- [`tanzania-cloud-cutover.md`](tanzania-cloud-cutover.md)

## Supporting developer references

- [`../scripts/DEBUGGING.md`](../scripts/DEBUGGING.md)
- [`../src/platform/config/README.md`](../src/platform/config/README.md)
- [`../src/shared/errors/README.md`](../src/shared/errors/README.md)
- [`../src/shared/utils/README.md`](../src/shared/utils/README.md)

## Documentation policy

- Add durable architecture, runbook, release-gate, or current-work documentation only.
- Append completed DOMS work to `DOMS_INTEGRATION_HISTORY.md`.
- Append completed general refactors to `REFACTOR_PASS_HISTORY.md`.
- Do not commit generated simulator/live reports or evidence files. Store approved evidence externally and retain its reference or digest.
- Remove obsolete implementation summaries once the code and durable documentation supersede them.
- Use Git history as the archive for deleted pass notes.
