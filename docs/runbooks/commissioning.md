# Commissioning

**Type:** production release/field runbook  
**Audience:** Commissioning engineers, site technicians, release engineers, and technical support  
**Repository baseline:** `main` commit `03cc45e6bb7c09d01994f2d98743dfb346bfc520` (2026-09-11)

Use this runbook for first-site activation, controlled recommissioning, or release acceptance after an upgrade. It complements the [Technician Setup Guide](../manuals/TECHNICIAN_SETUP_GUIDE.md) and [Production Installation and Upgrade](production-installation.md).

> **Go/no-go principle:** production acceptance requires stable runtime, correct forecourt topology, transaction continuity, printing/fiscal readiness, and documented sign-off. A successful login or healthy HTTP liveness check alone is not sufficient.

## 1. Before the deployment window

Confirm the release candidate has passed the approved engineering gates and that the deployment ticket contains:

- release/package version and target commit/tag
- controller architecture target
- approved deployment artifact
- release notes and known limitations
- rollback package and rollback criteria
- database backup/recovery reference
- site identity and timezone
- DOMS/PSS/JPL connection details
- printer endpoint
- proxy/fiscal endpoint details
- country-specific fiscal prerequisites
- test/acceptance scenario
- site and technical approvers

Archived first-site/release-gate files may be used only as historical evidence templates. Current acceptance evidence belongs in the deployment/change process.

## 2. Pre-change baseline

Before stopping the old version, capture:

- installed package version
- `/api/livez`
- `/api/startup/status`
- `/api/readyz`
- `/api/healthz`
- current JPL/PSS connectivity state
- current pump/nozzle/tank mapping summary
- approved price set
- printer status
- proxy/fiscal status
- any active alarms or unresolved transactions
- a redacted forecourt support bundle when available

Record all pre-existing faults separately so they are not confused with release regressions.

## 3. Install and start

Follow [Production Installation and Upgrade](production-installation.md).

Acceptance cannot begin until:

- the approved architecture-specific package is installed
- startup reaches ready or any degraded state is fully understood and approved
- database migrations complete without unresolved errors
- service remains stable through the initial observation period

## 4. Health and startup gate

Verify:

```text
GET /api/livez
GET /api/startup/status
GET /api/readyz
GET /api/healthz
```

Required result:

- liveness answering
- startup reaches ready
- readiness/health overall `ok` is true, or an explicitly non-required integration is documented as intentionally unconfigured
- database component healthy
- required worker heartbeats present and not stale
- configured printer/proxy/integration components healthy or an approved exception is documented

Do not continue production acceptance if the database, required workers, or required JPL component is unhealthy.

## 5. JPL/PSS read-only validation gate

Before operational writes:

1. confirm production JPL host and TCP port
2. confirm POS ID and operation mode
3. confirm JPL/PSS version compatibility
4. confirm approved access code/capabilities
5. confirm TLS settings where required
6. confirm stable logon/session and heartbeat behavior
7. confirm required unsolicited subscriptions
8. confirm pump state visibility
9. confirm transaction-buffer visibility
10. confirm tank/wet-stock visibility where in scope
11. confirm no repeated reconnect/protocol reject loop

Where approved engineering tooling is available:

```bash
npm run doms:jpl-live:validate -- --host <pss-host> --port 8888 --profile full-readonly
```

Do not use price changes or dispenser/maintenance control commands as connectivity tests.

## 6. Configuration reconciliation gate

Use the Setup Wizard / Forecourt Monitor reconciliation capability to compare FTC configuration with the live PSS.

Confirm:

- pump identifiers
- nozzle identifiers
- tank identifiers
- nozzle-to-tank relationships
- product/grade assignments
- operational pump modes/settings in scope
- pricing values

Resolve mismatches deliberately. If the PSS is wrong, correct it through the approved PSS Configurator/change process and rerun reconciliation. Do not silently compensate in VPOS.

## 7. Site setup gate

For a new/recommissioned site, verify the Technician Setup Guide has been completed:

- site profile
- country/currency/timezone
- product records
- tank records and grades
- pump/nozzle mappings
- printer configuration and tests
- proxy/fiscal configuration
- setup finalization

For an upgrade, verify these values remain unchanged unless the release/change specifically intended to modify them.

## 8. Controlled operational acceptance

Use a site-approved test scenario and collect evidence for:

### Forecourt

- pump state changes are current
- intended nozzle/product/tank relationship is shown correctly
- no stale/offline station-wide condition
- tank levels/wet-stock are visible where configured

### Transactions

- a controlled forecourt transaction is ingested
- the transaction appears once in VPOS
- amount/product/pump/time values are correct
- no duplicate/replay anomaly is observed

### Receipt and printing

- receipt preview/rendering succeeds
- physical receipt prints correctly
- station identity/layout is correct
- print-job state completes successfully

### Fiscal/proxy

Where required:

- transaction enters the expected fiscal lifecycle
- proxy is healthy/reachable
- fiscal completion succeeds or follows the approved offline path
- country-specific receipt/fiscal identifiers are present

### Reporting

- transaction is visible in the expected report/search period
- station timezone/business-date projection is correct

## 9. Tanzania-specific acceptance

For Tanzania stations, additionally verify:

- Tanzania fiscal page/device/proxy state is correct
- daily-total configuration is correct
- receipt preview works for customer-assigned and non-customer transactions
- persisted receipt identity is reused on retry
- delayed transaction behavior is accepted: invoice/daily-counter date may differ from Z/invoice assignment date
- migration `1320_tanzania_assignment_counter_scope.sql` is present in deployments that require it
- migration `1330_tanzania_unfiscalized_assignment_time_backfill.sql` is applied where included by the release package

Do not manually renumber counters or Z numbers to make delayed transactions look sequential across different date scopes.

## 10. Restart/recovery gate

If allowed by the site deployment plan, perform one controlled application restart after acceptance activity.

Verify after restart:

- startup returns to ready
- readiness/health return to OK
- JPL session reconnects and stabilizes
- configuration persists
- pumps/tanks refresh
- required workers resume
- printer remains available
- fiscal/proxy path remains healthy
- no migration/bootstrap action fails

A station that only works until the first restart is not production-ready.

## 11. Field-validation evidence

The application exposes operator-facing forecourt field-validation/readiness tooling in the administrator forecourt area. Use it as part of go/no-go evidence where enabled.

At sign-off, capture or export:

- field-validation readiness state
- configuration reconciliation status
- support bundle
- outstanding action list
- any approved deviations

The redacted forecourt support bundle is available through the admin forecourt UI and the endpoint:

```text
GET /api/admin/forecourt/support-bundle
```

Do not attach raw secrets to release evidence.

## 12. Release blockers

Production release is blocked if any of the following is unresolved and required for the site:

- startup remains degraded
- database/migration error
- required worker missing/stale
- unstable JPL session
- unresolved topology/mapping mismatch
- incorrect pricing
- transaction loss/duplication
- printer unavailable without approved operating workaround
- required fiscal/proxy path unavailable
- critical TLS/security artifact invalid
- controlled restart does not recover automatically

Document any non-blocking warning with an owner and follow-up date.

## 13. Rollback decision

Trigger the approved rollback when:

- a release blocker cannot be resolved safely inside the deployment window
- recovery requires untested database surgery
- live trading safety/compliance is at risk
- the new package materially regresses a capability that worked in the captured pre-change baseline

Use the package/data rollback plan. Do not improvise by partially mixing files from releases or editing migration history.

## 14. Site manager training gate

Before production handover, a site manager/supervisor must complete the [Manager Training Guide](../manuals/MANAGER_TRAINING_GUIDE.md) or equivalent approved training.

Minimum competency sign-off:

- sign in and understand role boundaries
- start-of-shift checks
- transaction search and exception identification
- non-fiscalized transaction review
- receipt lookup/reprint workflow
- pump/tank operational review
- pricing/change-control boundary
- end-of-shift handover
- escalation evidence to capture
- actions managers must **not** take without administrator/support approval

## 15. Final handover record

Record in the deployment ticket:

- release/package version and controller architecture
- installation time
- startup/readiness/health result
- migration result
- JPL/PSS validation result
- reconciliation result
- controlled transaction reference
- receipt/print test result
- fiscal/proxy result
- restart/recovery result
- support-bundle/readiness evidence reference
- outstanding warnings/actions
- rollback package reference
- technician sign-off
- site manager training/sign-off
- final go/no-go approver and timestamp

## 16. Related documentation

- [Production Installation and Upgrade](production-installation.md)
- [Production Debugging](production-debugging.md)
- [Forecourt Recovery](forecourt-recovery.md)
- [Technician Setup Guide](../manuals/TECHNICIAN_SETUP_GUIDE.md)
- [Manager Training Guide](../manuals/MANAGER_TRAINING_GUIDE.md)
- [Configuration](../configuration.md)
- [Startup Flow](../startup-flow.md)
