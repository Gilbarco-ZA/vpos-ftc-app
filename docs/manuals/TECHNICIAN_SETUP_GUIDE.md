# VPOS FTC Technician Setup Guide

**Audience:** Gilbarco/authorized field technicians and commissioning engineers  
**Purpose:** Install and commission the packaged `vpos-ftc-app` on a production DOMS/PSS site.  
**Documentation baseline:** `vpos-ftc-app` commit `2b0ad7f21c7ef19a4b7c6e8dad8293f155c745c3`  
**Applies to:** packaged CPB-539 (`armv7l`) and CPB-579 (`arm64`) targets built by the production pipeline.

> **Safety and change-control boundary**
>
> This guide assumes an approved production deployment window. Validate DOMS/JPL connectivity in read-only mode before enabling operational writes. Do not change dispenser, PSS Configurator, TLS, pricing, or production-maintenance settings without the site's approved change procedure.

## 1. What the packaged application contains

The production build generates a standalone Node entry point, `vpos-server.cjs`. The package runtime requires:

- `start.cjs`
- `vpos-server.cjs`
- `src/platform/runtime/env-defaults.cjs`
- the Next.js runtime produced by the CI package process
- Node.js 22.15.0 for the target CPB architecture

The production CI currently creates packages for:

| Target | Architecture | Runtime |
| --- | --- | --- |
| CPB-539 | `armv7l` | Node 22.15.0 |
| CPB-579 | `arm64` | Node 22.15.0 |

Do **not** perform a source checkout and `npm install` on a production controller. Install the approved package produced by the deployment pipeline using the site's approved FCC/DOMS application-package procedure.

## 2. Responsibility boundaries

`vpos-ftc-app` owns the station-local PostgreSQL-backed application state and forecourt runtime. Cloud delivery and endpoint routing are owned by `vpos-proxy`.

The VPOS setup UI can persist FTC/JPL connection settings and map discovered forecourt entities. It does not replace PSS Configurator. Configuration that belongs to DOMS/PSS must be completed and approved there first.

## 3. Information to collect before arriving on site

Record the following in the commissioning work order before changing the station:

### Site identity

- station/site name
- physical address
- country
- currency
- timezone
- station tax number/TIN where applicable
- approved VPOS software/package version
- target controller model: CPB-539 or CPB-579

### DOMS/PSS connection

- production DOMS/PSS host or IP address
- JPL TCP port; the application default is `8888`
- JPL POS ID; the application default is `01`, but use the site-assigned value
- operation mode: `unsupervised` or `supervised`
- `FcAccessCode`; production commissioning expects the access required by the approved integration scope
- JPL country code
- expected JPL/PSS version; application minimum default is `470-02-1.07`
- whether TLS is required and, if so, server name and approved certificate/CA/key paths
- site-specific unsolicited subscription flags if they differ from the approved defaults

### Forecourt mapping

- pump identifiers
- nozzle identifiers per pump
- tank identifiers
- grade/product assignments
- current approved forecourt prices
- tank/product relationships

### Peripheral and fiscal information

- receipt/report printer IP and port
- fiscal country requirements
- Tanzania TRA device/proxy details when commissioning a Tanzania station
- approved `vpos-proxy` target and connectivity information

## 4. Pre-installation checks

1. Confirm the package matches the controller architecture.
2. Confirm the controller date, time, and timezone are correct.
3. Confirm the controller has IP reachability to the production DOMS/PSS host.
4. Confirm the configured JPL TCP port is reachable under the site's network policy.
5. Confirm PostgreSQL is available to the packaged application according to the deployment environment.
6. Confirm required TLS files, when used, are stored outside the public web root and have the correct permissions.
7. Record the currently installed VPOS version and retain the approved rollback package.
8. Do not disconnect or restart DOMS/PSS solely to install VPOS unless the approved site procedure requires it.

## 5. Install the approved package

Use the standard deployment/package mechanism supplied for the site controller. The exact package-manager commands are owned by the packaging/deployment system rather than this repository.

After deployment, verify that the application directory contains the packaged runtime, including `start.cjs` and `vpos-server.cjs`.

Start or restart the VPOS package using the site-standard application supervisor.

### First-boot behavior

On startup, VPOS performs bootstrap work including database availability checks and ordered PostgreSQL migrations. Migrations are transaction-protected and recorded in `schema_migrations`.

Do not manually edit migration state or run SQL migrations by hand as part of normal commissioning.

If startup fails during a migration, capture the complete error and resolve the migration/database problem before continuing setup.

## 6. Confirm process health before configuration

From an authorized station-network client, verify the following endpoints on the installed VPOS base URL:

```text
GET /api/livez
GET /api/readyz
GET /api/healthz
```

Interpret them as follows:

- `/api/livez` — the HTTP process is running and responding. It intentionally does not prove database or integration health.
- `/api/readyz` — deeper application readiness.
- `/api/healthz` — station runtime health information.

Do not proceed merely because `/api/livez` succeeds. Resolve readiness/health failures first.

## 7. Sign in and open the Setup Wizard

Sign in with an authorized administrator account and open:

**Setup & Configuration → Setup Wizard** (`/admin/setup`)

The current setup flow is designed around:

1. site profile
2. products
3. forecourt/pump mapping
4. printer
5. finalization

The Setup Wizard also includes the JPL forecourt settings and PSS configuration verification used during commissioning.

## 8. Configure the site profile

In the Setup Wizard, enter and save:

- site name
- tax number
- address
- country
- currency
- timezone

Use the correct country dataset. Country selection controls country-specific behavior, including Tanzania fiscal functions where applicable.

Verify the saved values before proceeding. A wrong timezone or country is a commissioning defect, not a cosmetic setting.

## 9. Configure the production DOMS/JPL connection

In **Setup Wizard → Imports & forecourt settings → Forecourt connection**, configure the production JPL connection.

The supported forecourt runtime is `jpl_tcp`.

### Required core fields

| UI field | Runtime key | Guidance |
| --- | --- | --- |
| JPL TCP host | `JPL_TCP_HOST` | Set to the production DOMS/PSS host. Do not use loopback for a remote production PSS. |
| JPL TCP port | `JPL_TCP_PORT` | Default `8888`; use the approved site port. |
| JPL POS ID | `JPL_POS_ID` | Default `01`; use the unique site-assigned POS ID. |
| Operation mode | `JPL_OPERATION_MODE` | `unsupervised` or `supervised`; must match the approved site model. |
| JPL access code | `JPL_FC_ACCESS_CODE` | Default is `POS`; field acceptance may require additional approved flags such as diagnostic/reject information. |
| JPL country code | `JPL_COUNTRY_CODE` | Default `1`; use the site/vendor value. |
| POS version ID | `JPL_POS_VERSION_ID` | Application default `470-02-1.08`. |
| Expected minimum version | `JPL_EXPECTED_MIN_VERSION` | Application default `470-02-1.07`. |

### Connection timing defaults

| Setting | Default | Commissioning note |
| --- | ---: | --- |
| Unsolicited DR seconds | `5` s | Keep aligned with approved JPL behavior. |
| Heartbeat interval | `15000` ms | UI guidance requires 15 seconds or less. |
| Dead connection timeout | `30000` ms | Must be greater than the heartbeat interval. |
| Status update code | `3` | Change only when required by the approved integration contract. |
| Bootstrap snapshot | enabled | Leave enabled unless an approved site exception exists. |

### Default unsolicited subscriptions

The application defaults are:

```text
UNSO_INSTSTA_1,UNSO_TRBUFSTA_3,UNSO_TGSTA_1,UNSO_DELIVSTA_1,UNSO_PRISTA_1
```

Default MFDR subscription:

```text
UNSO_FPSTA_3
```

Do not remove subscriptions simply to make commissioning appear healthy. Reconcile required flags against the site's DOMS/PSS configuration and the approved JPL contract.

### Saving connection settings

Production forecourt settings saved by the setup UI are persisted as station configuration and override runtime defaults. After saving connection changes, restart the FTC server/package process when prompted so the live connection is recreated with the new values.

## 10. TLS configuration

If the DOMS/JPL connection is secured, verify the approved values for:

- `JPL_TLS_REQUIRED`
- `JPL_TLS_REJECT_UNAUTHORIZED`
- `JPL_TLS_SERVERNAME`
- `JPL_TLS_CA_PATH`
- `JPL_TLS_CLIENT_CERT_PATH`
- `JPL_TLS_CLIENT_KEY_PATH`
- `JPL_TLS_MIN_VERSION` (`TLSv1.2` or `TLSv1.3`)

Certificate and key material must not be placed in the public web root. Do not disable certificate verification as a permanent workaround for certificate errors.

## 11. Test JPL settings before enabling production operations

Use the **Test JPL settings** action in the forecourt setup card before proceeding.

For release/field validation where repository tooling is available in the approved engineering environment, the project also provides a live read-only validator. Typical usage is:

```bash
npm run doms:jpl-live:validate -- \
  --host <pss-host> \
  --port 8888 \
  --profile full-readonly
```

The validation phase must be read-only. Do not use a production dispenser-control or maintenance action merely as a connectivity test.

Acceptance requires more than a TCP socket opening. Confirm:

- expected JPL version
- valid POS identity/session
- required access-code capabilities
- unsolicited subscriptions
- heartbeat/dead-connection timing
- pump state visibility
- tank/wet-stock visibility where in scope
- transaction-buffer visibility
- no repeated reconnect loop or protocol rejection

## 12. Verify PSS configuration and topology

Use the Setup Wizard's PSS configuration verification/reconciliation capability to compare the FTC configuration with what the PSS reports.

Any mismatch between VPOS and the live PSS must be resolved deliberately. Do not silently remap VPOS to compensate for an incorrectly configured PSS.

Where PSS configuration must change, make that change through the approved PSS Configurator process, then rerun verification.

## 13. Configure products and tanks

Before mapping nozzles, ensure the station has the correct product and tank records.

Use the relevant setup/configuration pages:

- **Products**
- **Tank Settings**
- **Tank Grades**

Verify:

- every active fuel grade has a product record
- every physical tank used by a nozzle exists and is active
- the tank grade/product relationship matches the physical site
- identifiers can be traced back to the DOMS/PSS configuration

## 14. Map pumps and nozzles

Refresh live pump data in the Setup Wizard. VPOS uses discovered pump/nozzle state and stores nozzle-to-tank mappings.

For every pump and nozzle:

1. identify the live DOMS/PSS pump/nozzle
2. select the physical tank supplying that nozzle
3. review any automatic mapping suggestion
4. save only after every active nozzle is mapped

The Setup Wizard blocks save when nozzles remain unmapped.

Verify the resulting configuration again under:

- **Pumps**
- **Pump Settings**
- **Forecourt Setup**

Never infer a tank mapping solely from a similar product name when site drawings/PSS configuration disagree.

## 15. Configure and validate pricing

Open **Setup & Configuration → Forecourt Pricing**.

Confirm that displayed grades/products and prices match the approved site price set. Follow the site's price-change authorization process for any production write.

Do not use a price change as an installation connectivity test.

## 16. Configure the printer

Open the printer setup in the wizard or **Setup & Configuration → Printers**.

Configure the approved printer endpoint and run, in order:

1. printer connectivity test
2. transaction print test
3. report print test

Confirm physical output, paper width/layout, station identity, and fiscal information where applicable.

## 17. Configure proxy/fiscal services

The station application and `vpos-proxy` are separate responsibilities.

Open **Fiscal Services → Proxy Settings** and verify the approved proxy configuration and status.

For Tanzania stations, also complete the current Tanzania fiscal commissioning workflow under **Fiscal Services → Tanzania Fiscal** and follow [Tanzania cutover](../runbooks/tanzania-cutover.md).

Do not bypass device registration, receipt-code, TRA verification, or fiscal cutover checks merely to complete station setup.

## 18. Finalize setup

The Setup Wizard considers the core setup ready to finalize when it has, at minimum:

- a site profile
- configured tank grades/active tanks
- products
- pump configuration
- a configured printer

Before selecting **Finalize**:

- refresh the setup state
- ensure live pump data is fresh
- confirm there are no unmapped active nozzles
- confirm printer tests pass
- confirm JPL/PSS verification is accepted
- confirm proxy/fiscal readiness where required

Finalize only after the commissioning checklist is complete.

## 19. Production acceptance test

Perform a controlled acceptance test under site authorization.

Minimum evidence:

- `/api/livez`, `/api/readyz`, and `/api/healthz` healthy
- stable DOMS/JPL connection for the observation period
- correct pump/nozzle/tank topology
- live pump state updates
- correct product/grade relationships
- correct approved prices
- transaction ingestion from the forecourt
- transaction visible in VPOS
- receipt generation/printing
- fiscalization/proxy flow where applicable
- tank-level/wet-stock visibility where configured
- no unresolved alarms or repeated protocol/session errors

Where a fuel transaction is required for acceptance, use the site's controlled test procedure and reconcile the test sale afterward.

## 20. Reboot/recovery check

After the initial acceptance test, perform a controlled restart of the VPOS package if the deployment procedure requires it.

Verify that:

- the process returns on `/api/livez`
- readiness returns without manual database intervention
- persisted JPL settings are retained
- the JPL session reconnects
- pump/tank state resumes
- workers recover
- no migrations fail

Do not accept a station that works only until the next package restart.

## 21. Troubleshooting

### VPOS process is not live

- capture package/supervisor logs
- verify the correct CPB architecture package was installed
- verify required runtime files are present
- check the startup error before changing configuration

### `/api/livez` works but `/api/readyz` or `/api/healthz` does not

- investigate database, worker, forecourt, proxy, or other reported dependencies
- do not treat the station as commissioned

### Migration error on startup

- capture the complete PostgreSQL error including SQLSTATE and constraint name
- verify the package contains the current migrations
- do not modify `schema_migrations` manually unless directed by an approved recovery procedure

### JPL test cannot connect

- verify the production PSS host and port
- verify network routing/firewall policy from the controller
- verify TLS requirements
- verify the PSS is listening on the expected interface

### JPL connects then repeatedly disconnects

- verify unique POS ID; a POS ID already leased by another physical client is invalid
- verify heartbeat and dead-connection timeout
- inspect access-code/protocol rejection details
- verify JPL version compatibility

### Pumps are visible but mappings are wrong

- compare live DOMS/PSS topology with station drawings and PSS Configurator
- correct the source configuration or VPOS mapping deliberately
- rerun reconciliation

### No live pump data

- check JPL session health and unsolicited subscriptions
- confirm required status flags are enabled
- use diagnostics rather than repeatedly restarting the package

### Printing fails

- test network reachability to the printer
- verify printer IP/port
- inspect **Print Jobs** and **Diagnostics**

## 22. Handover checklist

Record and hand over:

- [ ] installed package/version and controller architecture
- [ ] station identity/country/timezone verified
- [ ] DOMS/PSS host and JPL port verified
- [ ] unique POS ID verified
- [ ] JPL access code/version/subscriptions accepted
- [ ] TLS validation accepted where enabled
- [ ] pumps/nozzles/tanks reconciled
- [ ] products and prices checked
- [ ] printer tests passed
- [ ] proxy/fiscal checks passed where applicable
- [ ] controlled transaction/receipt test completed
- [ ] restart/recovery check completed
- [ ] diagnostics/support evidence captured
- [ ] unresolved exceptions documented
- [ ] site/organizational acceptance obtained

## 23. Related repository documentation

- [Configuration](../configuration.md)
- [Startup flow](../startup-flow.md)
- [Forecourt and DOMS/JPL](../domains/forecourt.md)
- [Commissioning runbook](../runbooks/commissioning.md)
- [Forecourt recovery](../runbooks/forecourt-recovery.md)
- [Secure artifacts](../runbooks/secure-artifacts.md)
- [Production debugging](../runbooks/production-debugging.md)
- [Tanzania cutover](../runbooks/tanzania-cutover.md)

When this guide conflicts with an approved site-specific DOMS/PSS commissioning procedure, stop and resolve the discrepancy through change control rather than guessing.
