# Commissioning

**Type:** runbook

1. Verify database connectivity, station identity, and current configuration hashes.
2. Run the repository test and vendor contract gates for the release candidate.
3. Validate DOMS/JPL connectivity in read-only mode before enabling writes.
4. Confirm pump, tank, pricing, transaction, alarm, and reconciliation mappings.
5. Verify TLS and secure artifact paths outside the public web root.
6. Capture startup, readiness, worker heartbeat, and support-bundle evidence.
7. Obtain site and organizational approval before enabling production maintenance or dispense-control actions.

Use the archived first-site and release-gate documents only as evidence templates; current acceptance criteria must be recorded in the deployment process.

## PSS5000 CPB539 hosting acceptance

For CPB539 deployments, assess the applicable PSS5000 third-party hosting Rule Book against the **exact installed package**. Do not equate successful application startup with completed platform compliance. Obtain GVR confirmation before applying CPB539 limits or approvals to other controller models.

### Package and dependency gates

- Record the signed package identity, runtime target, hardware model, relevant firmware/platform versions, and signature verification. Retain evidence of GVR-issued signing credentials, approved program/type ID and runtime/dependency approvals.
- Verify fresh install, upgrade and rollback behavior; the expected installed-package XML, SRD content and FccWebApp visibility; and clear install/uninstall status and syslog feedback.
- Verify **complete application removal** on an isolated test unit, including after a reboot where OPKG's volatile installed-package database may be reset. Resolve any retained executable snapshots or recovery files against the vendor's uninstall requirement; retain customer data only in approved locations and under an explicitly documented retention policy.
- Audit all read/write paths, including persistent customer state, PSS configuration exchange and PostgreSQL; identify paths outside the application's dedicated volatile/persistent directories and obtain the platform owner's authorization for each exception.
- Review generated runtime configuration and file permissions without printing environment values, credentials, signing material or connection strings.

### Runlevel acceptance and data safety

- The platform-managed `rc.app` callback **must remain non-blocking** and finish within the vendor's short-call limit (three seconds on the CPB539 Rule Book). Do not make the callback wait for database persistence, health checks or Node process exit.
- Verify runlevel 3 has no operating third-party service, runlevel 4 triggers a genuine suspend, runlevel 5 can resume, and runlevel 6 terminates cleanly. Use a lab controller/simulator with the forecourt idle, outstanding transactions settled, and an approved maintenance procedure.
- Distinguish **dispatch succeeded** from **suspend completed**. Collect the asynchronous lifecycle worker's receipt and log outcome, whether in-process queues drained and whether the Node process exited. Treat an absent or unverified receipt as a failed persistence acceptance; never infer success solely from SIGTERM or a successful HTTP liveness request.
- On controllers where PostgreSQL is stopped by the platform's runlevel K-script, check whether that shutdown overlaps the asynchronous FTC persistence worker. A fast-returning `rc.app` is compatible with the interface, but does **not** establish that PostgreSQL remained available throughout suspend.
- After resuming, verify PostgreSQL, FTC readiness, owner-matched JPL lease acquisition, representative historical transaction/fiscal data, pump/tank configuration and readings. Do not repair a failure by manipulating JPL lease rows, bypassing shutdown guards, forcing filesystem `sync`, or editing vendor init scripts.

### Performance, evidence and approval

- Define reproducible idle and high-load scenarios with equipment/software versions, forecourt/fiscalization/reporting workloads and test durations.
- Use vendor-prescribed tooling (NGPAT and FCC snapshot) after the prescribed idle stabilization interval, and collect high-load windows sufficient to evaluate CPU, MemAvailApps, tmpfs, network and flash I/O. Include PostgreSQL's resource consumption in the application's total. A short HTTP health soak is **not** a substitute.
- Compare measurements to the category and board-specific limits **confirmed by GVR**; do not infer resident RAM usage from BusyBox `ps` virtual size or infer application disk consumption from overall `df` usage.
- Verify syslog tagging/severity, release logging volume, secure certificates, network/firewall changes, open-source licenses, release-document consistency and vendor delivery/approval records.
- Store raw measurements and site-specific acceptance evidence **outside the repository**, redacted as necessary. Keep the commissioning decision explicitly conditional until each required vendor approval and test has passed.

**Safety gate:** Do not run a live 5 -> 4 -> 5 transition, uninstall, PostgreSQL stop or invasive load test on an operating forecourt. These are separately authorized lab/maintenance activities, not routine read-only commissioning checks.
