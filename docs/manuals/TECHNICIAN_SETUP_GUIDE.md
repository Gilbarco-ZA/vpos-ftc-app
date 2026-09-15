# VPOS FTC Field Support, Installation & Commissioning Manual

**Audience:** Gilbarco/authorized field technicians, commissioning engineers, and production support  
**Purpose:** Single-file production manual for installing, configuring, commissioning, supporting, and handing over VPOS FTC on a DOMS controller.  
**Production model:** Secure packaged application installed on DOMS; no SSH, shell, source checkout, terminal, or field command execution is required or supported.

This is the primary on-site support manual. It is intentionally self-contained so a technician can complete installation, configuration, commissioning, first-line diagnosis, and handover without relying on repository scripts or terminal access.

> **Field operating rule**
>
> Production adjustments are made through the VPOS application and approved DOMS package-management workflow. Do not attempt to create or edit `.env` files, execute application scripts, access the controller filesystem, run database commands, or use SSH as part of normal installation or support.

## 1. Production deployment model

VPOS FTC is delivered as an approved Node.js 22 package for the target DOMS controller.

| DOMS controller | Production package | Architecture |
| --- | --- | --- |
| CPB-579 | `cpb-579-node22.pkg` | ARM64 |
| CPB-539 | `cpb-539-node-22.pkg` | ARMv7l |

The package contains the application runtime and the required production defaults. It is installed on the DOMS using the approved DOMS package installation mechanism and runs as a managed, secured application.

The field support model therefore assumes:

- no SSH access to the DOMS
- no terminal or command-line access
- no source-code checkout on the DOMS
- no `npm`, Node, SQL, or operating-system commands executed by the technician
- no manual file copying into the installed application
- no production `.env` file
- no requirement for a technician to inspect application files
- configuration changes are made from supported VPOS administration screens
- package start, stop, upgrade, and rollback use the approved DOMS package-management controls

If a production issue appears to require shell access, manual database manipulation, or application-file modification, stop and escalate to engineering. That is outside the supported field procedure.

## 2. Configuration model

VPOS is designed so station-specific operational configuration can be maintained from the application rather than from environment files.

Field-adjustable configuration includes the applicable station settings for:

- site identity, country, currency, and timezone
- products and grades
- tanks and tank-grade relationships
- pumps, nozzles, and nozzle-to-tank mappings
- DOMS/JPL connection settings
- forecourt operating settings
- approved forecourt pricing
- printer configuration
- proxy/fiscal configuration
- Tanzania fiscal settings where applicable
- ATG/tank polling settings
- other administrator-owned station configuration exposed by the application

Production packages contain safe runtime defaults for values that do not require site-specific adjustment. The application persists supported site-specific configuration in its station data model.

`.env` files are a development convenience only. They are not a field configuration mechanism and must not be requested, created, edited, or deployed on a production DOMS.

Some security material, such as certificates or secure credentials, may be provisioned by the approved package/deployment process. Field staff should manage only the application settings and references exposed through authorized VPOS screens.

## 3. Roles and access required on site

The technician should have an authorized `administrator` account for commissioning and technical support.

Administrator functions include the additional controls required for installation validation and diagnosis, such as:

- Setup Wizard
- Forecourt Monitor
- Device Status
- Diagnostics
- Print Jobs
- Proxy Settings
- Tanzania Fiscal where applicable
- Runtime Control
- Maintenance
- Station Settings / Station Config
- Printers
- Products and Product Categories
- Users where approved

Do not use or share another person's administrator credentials. Managers should continue to use manager accounts for daily operations.

## 4. Information required before installation

The deployment/change record should contain the following before work begins.

### Package and site

- station/site name and identifier
- DOMS controller model: CPB-579 or CPB-539
- currently installed VPOS version/package where replacing an existing version
- approved target package and version
- approved rollback package/version
- maintenance window/change reference
- country, currency, and timezone
- local site contact and escalation contact

### DOMS/PSS/JPL

- production DOMS/PSS host or address as presented to VPOS
- approved JPL TCP port; default is normally `8888`
- site-assigned JPL POS ID
- approved operation mode: supervised or unsupervised
- approved access-code/capability expectations
- country code and expected JPL/PSS version where required
- TLS requirements where enabled

### Forecourt

- pump identifiers
- nozzle identifiers
- tank identifiers
- products/grades
- nozzle-to-tank relationships
- approved forecourt prices

### Peripherals and fiscal services

- approved printer endpoint/details
- approved proxy configuration
- country-specific fiscal prerequisites
- Tanzania fiscal/device information where applicable

Do not discover production configuration by trial and error when the information should already exist in the commissioning record or approved PSS configuration.

## 5. Pre-installation checks

Before changing the station:

1. Confirm the DOMS controller model.
2. Confirm the package matches that controller exactly.
3. Confirm the controller's date, time, and timezone are correct.
4. Confirm the current station is in a safe state for the maintenance window.
5. Record the currently installed VPOS package/version where applicable.
6. Record known pre-existing faults so they are not attributed to the new release later.
7. Confirm the rollback package is available through the approved DOMS package process.
8. Confirm the station has the approved network path to DOMS/PSS, printer, and proxy/fiscal services.
9. Confirm the site configuration and physical forecourt information are available.
10. Confirm any required database backup/recovery step in the release procedure has been completed by the responsible platform process.

## 6. Install or upgrade the package on DOMS

Use the approved DOMS package-management process.

### CPB-579

Install the approved `cpb-579-node22.pkg` package.

### CPB-539

Install the approved `cpb-539-node-22.pkg` package.

### Installation sequence

1. Put the site into the approved maintenance state.
2. Record the old package/version if upgrading.
3. Select the correct approved package for the DOMS controller.
4. Install or upgrade the package using the authorized DOMS package installer.
5. Start/enable the VPOS package through the same approved package-management interface if it is not started automatically.
6. Record the installation/start time.
7. Open VPOS from an authorized browser/client and confirm that the application is reachable.
8. Sign in with the authorized administrator account.
9. Continue with startup validation and in-app configuration.

Do not copy individual runtime files, modify package contents, or attempt to repair an installation by changing files on the DOMS.

## 7. First startup expectations

The package performs its own startup/bootstrap work. This includes the application database bootstrap, ordered schema migrations, HTTP service startup, runtime initialization, forecourt connection initialization, and worker startup.

A technician does not manually run database migrations.

During first startup or upgrade:

- allow the application to complete startup before changing configuration repeatedly
- use the VPOS UI and administrator diagnostics to determine whether startup is healthy
- if the application reports a migration/bootstrap failure, capture the visible error and escalation details rather than attempting SQL repair
- if an upgrade cannot reach a stable application state inside the change window, follow the approved package rollback procedure

## 8. Initial application checks

After the package starts:

1. Confirm the login page loads normally.
2. Sign in as administrator.
3. Confirm the Dashboard renders without a global startup failure.
4. Open **Diagnostics** and note any critical application/runtime failure.
5. Open **Device Status** and identify any configured dependency that is unavailable.
6. Open **Forecourt Monitor** and determine whether the DOMS/JPL session is disconnected, connecting, stable, or repeatedly reconnecting.
7. Open **Print Jobs** only if printer testing or troubleshooting is required.
8. Confirm the application can navigate between administration pages without repeated server errors.

Do not treat a single loaded page as proof that forecourt, printing, database, proxy, and fiscal functions are all healthy.

> **Screenshot placeholder — application health / diagnostics**  
> **File:** `docs/images/support/support-diagnostics.png`  
> Capture: Diagnostics with the overall status, relevant component state, timestamp/context, and no secrets or customer data.

## 9. Setup Wizard

For a new station, approved recommissioning, or configuration recovery, open:

**Setup & Configuration → Setup Wizard**

Use the wizard to complete and verify the station configuration.

For an upgrade of a working commissioned station, do not overwrite existing values simply because the wizard is available. Confirm that the previously approved configuration has been retained.

## 10. Site profile

Configure and verify:

- site name
- tax number where applicable
- address
- country
- currency
- timezone

Country and timezone are operational settings. Incorrect values can affect fiscal behavior, reporting, daily totals, and transaction date interpretation.

## 11. DOMS/JPL forecourt connection

In the Setup Wizard/forecourt connection section, configure the production DOMS/JPL values provided by the site commissioning record.

Typical fields include:

| Setting | Guidance |
| --- | --- |
| JPL host | Use the approved production DOMS/PSS host. |
| JPL port | Use the approved site port; the normal default is `8888`. |
| POS ID | Use the unique site-assigned POS ID. |
| Operation mode | Must match the approved site model. |
| Access code/capabilities | Must match the approved integration scope. |
| Country code | Use the approved site/vendor value. |
| POS/JPL version expectations | Keep aligned with the approved DOMS/PSS version. |
| Heartbeat/dead-connection settings | Change only where the approved integration requires it. |
| Unsolicited subscriptions | Keep the required station subscriptions enabled. |
| TLS settings | Use the approved security configuration where TLS is required. |

Use the in-app **Test JPL settings** function before enabling production operations.

Do not use price changes, maintenance actions, or dispenser controls merely to test connectivity.

> **Screenshot placeholder — JPL setup**  
> **File:** `docs/images/support/support-setup-jpl.png`  
> Capture: Forecourt connection card showing field labels, connection/test status, and non-sensitive values only. Redact real infrastructure details where required.

## 12. Forecourt Monitor and connection acceptance

Open **Forecourt Monitor** and confirm:

- the JPL session establishes successfully
- the session remains stable rather than reconnecting repeatedly
- expected pump state is visible
- transaction-buffer/state information is current
- tank/wet-stock information is visible where configured
- no persistent protocol/authentication rejection is shown

If the connection is unstable, correct the approved settings through the application. Do not attempt network or process troubleshooting through the DOMS shell because no shell access is part of the production support model.

> **Screenshot placeholder — Forecourt Monitor**  
> **File:** `docs/images/support/support-forecourt-monitor.png`  
> Capture: session/connection state plus enough pump/device context to distinguish healthy, disconnected, and reconnecting states.

## 13. Reconcile VPOS with PSS configuration

Use the application's PSS configuration verification/reconciliation capability where available.

Confirm that VPOS and the physical/PSS configuration agree on:

- pumps
- nozzles
- tanks
- products/grades
- mappings
- applicable forecourt settings

If the PSS itself is wrong, correct it through the approved PSS Configurator process and then rerun VPOS verification. Do not create a deliberately incorrect VPOS mapping to compensate for a PSS configuration defect.

> **Screenshot placeholder — configuration reconciliation**  
> **File:** `docs/images/support/support-reconciliation.png`  
> Capture: reconciliation result showing matched/mismatched status without exposing sensitive host or credential details.

## 14. Products, tanks, and grades

Use the supported configuration pages to confirm:

- each active fuel grade has the correct product record
- each physical tank exists and is active where appropriate
- each tank is assigned the correct grade/product
- tank identifiers match the approved site/PSS topology
- ATG polling settings are correct where wet-stock integration is used

Do not apply arbitrary stock adjustments to hide a mapping or ATG issue.

## 15. Pumps and nozzle-to-tank mapping

Use Setup Wizard, **Pumps**, **Pump Settings**, and **Forecourt Setup** as appropriate.

For every active nozzle:

1. identify the physical pump/nozzle
2. match it to the DOMS/PSS identifier
3. select the physical tank supplying that nozzle
4. verify the corresponding product/grade
5. save only after the mapping is confirmed
6. recheck the forecourt view after saving

Do not use trial-and-error mapping on a live station.

## 16. Forecourt pricing

Open **Forecourt Pricing** and confirm that displayed grades/products and prices match the approved site price set.

A price change is a controlled operational action. Use the site's approved authorization and verification process.

Do not change a price as a connectivity test.

## 17. Printer configuration

Use the Setup Wizard or **Setup & Configuration → Printers**.

Configure the approved printer and perform the in-app tests available for:

- printer connectivity
- transaction receipt output
- report output

Confirm physical output, paper/layout, station identity, and required fiscal content.

For troubleshooting, administrators can use **Print Jobs** to see whether a print request is queued, processing, failed, or completed.

> **Screenshot placeholder — Print Jobs**  
> **File:** `docs/images/support/support-print-jobs.png`  
> Capture: one representative job with status and time; use synthetic/redacted transaction data.

## 18. Proxy and fiscal services

Open **Fiscal Services → Proxy Settings** and verify the approved configuration/status.

Determine whether fiscal failures are:

- local transaction/receipt generation
- station-to-proxy connectivity/configuration
- proxy/cloud processing
- country fiscal service/device processing

Do not repeatedly resubmit the same transaction without understanding its current state.

## 19. Tanzania stations

For Tanzania, complete the administrator setup under **Tanzania Fiscal** and the applicable daily-total workflow.

Important operating semantics:

- the invoice number/daily counter can be scoped to the originating transaction date
- the Z number/invoice date can be scoped to the first fiscalization or pre-fiscalization assignment date
- a delayed transaction can therefore legitimately contain two different business/fiscal dates
- opening a receipt preview may persist the receipt identity where pre-fiscalization printing is enabled
- retries should reuse the persisted identity rather than create a new one

Do not manually alter invoice numbers, daily counters, Z numbers, fiscal identifiers, or database state to resolve a single transaction discrepancy.

## 20. Final setup verification

Before finalizing setup, confirm:

- site profile correct
- correct country/currency/timezone
- JPL settings tested successfully
- Forecourt Monitor stable
- PSS/VPOS reconciliation accepted
- products/grades correct
- tanks correct
- every active nozzle mapped correctly
- approved prices correct
- printer configured and tested
- proxy/fiscal status accepted where required
- Tanzania configuration complete where applicable

Only finalize after the configuration represents the physical site.

## 21. Production acceptance test

Perform the site-approved controlled acceptance workflow.

Minimum acceptance evidence:

- application login and Dashboard healthy
- Diagnostics has no unresolved critical startup failure
- Forecourt Monitor shows a stable DOMS/JPL session
- expected pumps/nozzles/tanks are visible
- pump status changes are reflected correctly
- transaction ingestion is visible in VPOS
- a known transaction can be located
- receipt preview/generation works
- physical printing works
- fiscal/proxy flow works where applicable
- tank level/wet-stock information is plausible where configured
- approved prices are correct
- no unexplained repeated reconnect, queue, or runtime failure is present

If a controlled fuel transaction is required, follow the station test-sale procedure and reconcile it afterward.

## 22. Controlled restart and persistence check

If the release procedure requires a restart, use only the approved DOMS application/package control or the authorized in-app runtime control provided for that purpose.

After restart verify:

- VPOS becomes reachable again
- administrator sign-in works
- saved station configuration remains present
- the JPL session reconnects and stabilizes
- pumps/tanks return to current state
- printer remains usable
- proxy/fiscal status returns to normal
- no new startup/migration error is visible in Diagnostics

Do not accept a deployment that works only until the first controlled restart.

## 23. Troubleshooting model

Field diagnosis should begin in the application. Preserve evidence before restarting or changing configuration.

### Application cannot be opened

Check the DOMS package-management interface first:

- correct package installed for the controller
- package is enabled/running according to DOMS
- installation did not report an error
- no rollback or failed-upgrade state is shown

If the package cannot start and the approved UI does not provide enough evidence, escalate. Do not seek shell access as the next field step.

### Application opens but station is degraded

Use **Diagnostics** and **Device Status** to identify the affected component. Determine whether the issue is database/startup, forecourt, printer, proxy/fiscal, or another configured dependency.

### Many/all pumps stale

Use **Forecourt Monitor** and **Diagnostics**. Check the configured JPL host/port/POS ID/operation mode/TLS values through the application. Look for reconnect churn or an authentication/protocol rejection.

Do not remap every pump when the entire forecourt connection is failing.

### One pump/nozzle wrong

Compare the physical dispenser, PSS identifier, VPOS pump/nozzle, tank mapping, and product/grade. Correct only the confirmed configuration error through the appropriate VPOS or PSS configuration tool.

### Fiscalization failures

Use the transaction state plus **Proxy Settings** and country fiscal screens. Determine whether one transaction or many transactions are affected. Preserve the transaction ID and visible error/reference.

### Receipt exists but does not print

Use **Print Jobs** and printer status. Establish whether the first print is queued, failed, or complete before retrying.

### Tank data stale or implausible

Check whether the forecourt/JPL connection is healthy first, then confirm tank identifiers, mappings, ATG polling state, and current physical/site evidence.

### Reports or dates appear wrong

Check the station timezone and report filters in the application. Do not change timezone merely to make a report total align.

## 24. Support evidence and escalation

Capture the following before escalation:

- station identifier
- DOMS controller model
- installed VPOS package/version
- local time and timezone
- first failure time and last known good time
- exact application page/workflow
- affected pump/nozzle/tank/transaction/receipt/print-job identifier
- visible error text and request/reference ID where shown
- whether one item or the whole station is affected
- screenshots of relevant Diagnostics, Forecourt Monitor, Device Status, Print Jobs, or transaction state
- recent package upgrade, restart, price change, PSS change, network change, printer change, or configuration change
- actions already taken and whether they changed the symptom

Do not include passwords, certificates/private keys, full credentials, unredacted customer data, or other secrets in screenshots or support tickets.

## 25. Screenshot capture set for support training

These placeholders are intentionally embedded in this single manual. Replace them with approved screenshots from a training/demo station or carefully redacted production context.

### A. Diagnostics / startup state

> **Screenshot placeholder — Diagnostics / startup state**  
> **File:** `docs/images/support/support-diagnostics.png`  
> Show: component state, relevant warning/error, and visible context.

### B. Forecourt Monitor

> **Screenshot placeholder — Forecourt Monitor**  
> **File:** `docs/images/support/support-forecourt-monitor.png`  
> Show: connection/session state and representative pump status.

### C. Device Status

> **Screenshot placeholder — Device Status**  
> **File:** `docs/images/support/support-readiness-health.png`  
> Show: configured dependency status with no credentials.

### D. JPL setup

> **Screenshot placeholder — JPL setup**  
> **File:** `docs/images/support/support-setup-jpl.png`  
> Show: field labels, test action, and test result. Redact real host/address data when required.

### E. PSS/VPOS reconciliation

> **Screenshot placeholder — reconciliation**  
> **File:** `docs/images/support/support-reconciliation.png`  
> Show: matched/mismatched result and enough topology context to train the technician.

### F. Print Jobs

> **Screenshot placeholder — Print Jobs**  
> **File:** `docs/images/support/support-print-jobs.png`  
> Show: representative queued/failed/completed status using synthetic or redacted transaction information.

## 26. Commissioning sign-off

Record the following in the deployment/change record before leaving site:

| Item | Pass | Notes |
| --- | --- | --- |
| Correct package for DOMS controller | ☐ | |
| Package installed through approved DOMS process | ☐ | |
| Application reachable and administrator login successful | ☐ | |
| Site profile verified | ☐ | |
| JPL settings tested | ☐ | |
| Forecourt Monitor stable | ☐ | |
| PSS/VPOS reconciliation accepted | ☐ | |
| Pumps/nozzles/tanks mapped correctly | ☐ | |
| Approved pricing verified | ☐ | |
| Printer tested | ☐ | |
| Proxy/fiscal path verified | ☐ | |
| Tanzania setup verified where applicable | ☐ | |
| Controlled transaction/receipt accepted | ☐ | |
| Controlled restart/persistence accepted | ☐ | |
| Manager training completed | ☐ | |
| Rollback package confirmed | ☐ | |
| Open issues documented | ☐ | |

**Technician:** ______________________________  
**Station:** __________________________________  
**DOMS controller:** CPB-579 ☐ / CPB-539 ☐  
**Installed package/version:** __________________  
**Date/time:** _________________________________  
**Site representative:** ________________________

## 27. Field support boundaries

On a production DOMS, do not:

- request or use SSH as part of the normal support process
- open a terminal on the controller
- execute Node/npm scripts
- execute SQL manually
- edit package files
- create or edit `.env` files
- change operating-system service definitions
- disable TLS verification as a troubleshooting shortcut
- change prices as a connectivity test
- remap pumps/tanks by trial and error
- manipulate fiscal counters or receipt identifiers
- expose secrets in screenshots or support tickets

Use the VPOS configuration and diagnostic screens first. If the required correction is not exposed safely through the application or approved DOMS package-management workflow, escalate it as an engineering/deployment issue rather than bypassing the secure operating model.
