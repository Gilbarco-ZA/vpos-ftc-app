# VPOS FTC Management Guide

**Audience:** Station managers, supervisors, administrators, and operational support staff  
**Purpose:** Operate and manage an installed VPOS FTC station safely and consistently.  
**Documentation baseline:** `vpos-ftc-app` commit `2b0ad7f21c7ef19a4b7c6e8dad8293f155c745c3`

This guide describes the current role-based VPOS interface. Some menu items are country-dependent or configuration-dependent. Tanzania fiscal functions, for example, are shown only for Tanzania stations.

## 1. Roles and access

VPOS currently uses three application roles:

| Role | Primary responsibility | Typical access |
| --- | --- | --- |
| `tenant` | Daily POS operation | Dashboard, POS, transactions, receipts, customers, and TIN Allocation when configured |
| `manager` | Station operations and controlled configuration | Tenant functions plus reports, stock, transaction review, pumps, tanks, tank levels, forecourt setup, tank/pump configuration, and pricing |
| `administrator` | Technical and security administration | Manager functions plus fiscal inbox, diagnostics, device status, print jobs, users, runtime control, maintenance, proxy/fiscal settings, setup wizard, products, station configuration, languages, datasets, and branding |

Use the least-privileged role required for the task. Do not share administrator accounts for routine cashier or manager work.

## 2. Main navigation

The current application groups work into the following sections.

### Daily Operations

- **POS** — station sales/transaction operations.
- **TIN Allocation** — shown when TIN capture is configured before the transaction.
- **Transactions** — search and review transaction records.
- **Receipts** — access receipt records and output workflows.
- **Reports** — operational reporting; available to managers and administrators.
- **Daily Totals** — Tanzania-specific daily totals when the station country is Tanzania.
- **Customers** — maintain/use customer records.
- **Product Stock** — stock view and stock operations for management roles.

### Transaction Review

Managers and administrators have dedicated views for:

- non-fiscalized transactions
- fiscalized transactions
- receipt viewing
- receipt lookup

Administrators also have **Fiscal Inbox** for fiscal processing visibility.

### Forecourt

Managers can access:

- Pumps
- Tanks
- Tank Levels

Administrators additionally have:

- Forecourt Monitor
- Device Status
- Print Jobs
- Diagnostics

### Setup & Configuration

Managers can access operational forecourt configuration including:

- Pump Settings
- Tank Settings
- Tank Grades
- Forecourt Setup
- Forecourt Pricing

Administrators can also access:

- Setup Wizard
- Products
- Product Categories
- Pump Mode
- Station Settings
- Station Config
- Printers
- Country Datasets
- Languages
- Branding

### Fiscal Services and Administration

Administrators have:

- Tanzania Fiscal, on Tanzania stations
- Proxy Settings
- Users
- Runtime Control
- Maintenance

## 3. Start-of-shift management checks

Before normal trading, a manager should confirm that the station is operationally consistent.

Recommended sequence:

1. Sign in and open **Dashboard**.
2. Check **Pumps** for expected forecourt availability and stale/offline state.
3. Check **Tank Levels** where wet-stock integration is in use.
4. Check **Transactions → Non-fiscalized** for unresolved transactions carried over from the prior shift.
5. Confirm receipt printing is available by reviewing recent receipts or, for administrators, **Print Jobs**.
6. For Tanzania stations, review the Tanzania fiscal status and prior daily totals as required by the site's operating procedure.
7. If an administrator is present, inspect **Diagnostics** when the dashboard or forecourt shows degraded state rather than restarting services immediately.

Where the station exposes operational health endpoints to the local management/support network, `/api/readyz` and `/api/healthz` provide deeper readiness/health information. These endpoints are primarily operational-support tools rather than routine cashier screens.

## 4. POS and transaction operations

Use **POS** for normal station sales workflows. The transaction record becomes the primary management reference for later review, printing, fiscalization, and reporting.

For any disputed or failed transaction, capture the transaction ID before attempting corrective action.

Avoid creating a second manual transaction merely because the first transaction is slow to appear. First determine whether the original is pending, non-fiscalized, fiscalized, or otherwise already recorded.

## 5. Searching transactions

Open **Transactions** to find a transaction by the available filters and search controls. The underlying transaction service supports filtering by items including:

- transaction status
- fiscalization scope
- transaction ID
- pump number
- free-text search
- date/time range

The dedicated review links make the most common management filters easier to access:

- **Non-fiscalized** — transactions that still require investigation or fiscal processing.
- **Fiscalized** — completed fiscal records.
- **Receipt Viewer** — receipt-oriented view of fiscalized transactions.
- **Receipt Lookup** — manager lookup workflow for a known receipt/transaction reference.

When investigating an exception, work from the existing transaction record rather than re-keying the sale unless the approved recovery procedure explicitly requires it.

## 6. Non-fiscalized transactions

A non-fiscalized transaction is not automatically evidence that the forecourt sale failed. It indicates that the fiscal lifecycle has not reached the expected completed state.

Before taking corrective action:

1. open the transaction
2. verify station, pump, amount, product, and timestamp
3. determine whether the fiscal/proxy service is healthy
4. check whether the transaction is still pending or queued
5. review any visible error/reference information
6. use administrator diagnostics when required

Do not repeatedly resubmit or duplicate a fiscal request without understanding the prior state. Escalate persistent failures with the transaction ID and any request/error reference shown by the system.

## 7. Fiscalized transactions and receipt lookup

Use **Fiscalized** and **Receipt Viewer** to confirm that completed transactions have the expected fiscal and receipt information.

Use **Receipt Lookup** when a customer or auditor supplies a known transaction/receipt reference.

Managers and administrators can request a receipt print from the transaction workflow. If printing fails, verify the print job rather than repeatedly issuing print requests.

## 8. Receipts and printing

Use **Receipts** for normal receipt access. Administrators can use **Print Jobs** for printer troubleshooting and queue visibility.

If a receipt does not print:

1. confirm that the transaction exists and has the expected receipt data
2. check whether a print job was created
3. check printer connectivity and paper/device status
4. retry only after establishing whether the first job failed or remains queued

Printer configuration is an administrator function under **Printers** and should not be changed as a first response to a single failed print.

## 9. Reports

Managers and administrators can use **Reports** for station reporting.

Use the station's agreed reporting period and timezone. If report totals and transaction searches differ, first verify:

- date/time filters
- timezone
- fiscalization status filter
- whether the report covers all transactions or only a subset/state

Do not alter station timezone to force a report to match an expected period. A timezone change affects wider station behavior and requires controlled configuration management.

## 10. Tanzania Daily Totals

For Tanzania stations, **Daily Totals** is available in Daily Operations and Tanzania fiscal administration is available to administrators.

Use these functions according to the station's fiscal operating procedure. Treat any discrepancy between local transaction totals, fiscal totals, and TRA-facing records as an exception requiring investigation.

Do not manually change receipt-verification or fiscal device settings to correct a single transaction discrepancy.

## 11. Customer management

Use **Customers** to locate and maintain customer records used by station operations.

Before creating a duplicate customer, search by the known customer identifiers. Where tax/TIN information is captured, verify the value against the source supplied by the customer or the applicable station process.

Do not repurpose one customer's record for another customer merely to complete a transaction.

## 12. Product stock

Managers and administrators can access **Product Stock**.

Use it to monitor the station's product inventory according to the site's stock-control procedure. Stock information should be reconciled with physical stock/wet-stock sources as applicable.

If stock appears incorrect, identify whether the difference originates from:

- transaction activity
- delivery activity
- tank/wet-stock data
- product/tank mapping
- a manual stock operation

Do not compensate for a mapping problem by entering an arbitrary stock adjustment.

## 13. Pump operations

Open **Pumps** to review current pump state.

A manager should distinguish between:

- an individual dispenser/nozzle issue
- a VPOS mapping issue
- a DOMS/JPL communication issue
- a station-wide connectivity issue

If several pumps become stale or unavailable at once, investigate forecourt connectivity before editing individual pump configuration.

Administrators can use **Forecourt Monitor**, **Device Status**, and **Diagnostics** for deeper investigation.

## 14. Tank operations and tank levels

Use **Tanks** and **Tank Levels** to review the configured tank estate and current wet-stock information where available.

Tank configuration must reflect the physical site and DOMS/PSS topology. If a tank is renamed, replaced, remapped, or assigned a different grade, follow the site's configuration/change process rather than making an unrecorded UI change during live trading.

## 15. Forecourt setup and nozzle-to-tank mapping

Managers and administrators can access **Forecourt Setup**, **Pump Settings**, **Tank Settings**, and **Tank Grades**.

These screens affect how VPOS interprets the physical forecourt. Changes must be based on confirmed site/PSS information.

Before saving a mapping change:

1. identify the physical pump/nozzle/tank involved
2. verify the DOMS/PSS identifiers
3. confirm the correct product/grade relationship
4. assess whether live transactions are in progress
5. record the reason for the change under the site's change-control process

Do not use trial-and-error mapping on a live production forecourt.

## 16. Forecourt pricing

Use **Forecourt Pricing** only under the station's approved price-change process.

Before applying a price change:

- verify the effective product/grade
- verify the approved new price
- verify timing/effective date requirements
- confirm the forecourt is in a suitable state for the change
- ensure any required signage/price-pole process is coordinated

After a change, confirm the displayed/effective price on the forecourt and verify the next controlled transaction if required by the operating procedure.

Do not make a price change merely to test DOMS/JPL write connectivity.

## 17. User administration

Administrators manage users under **Administration → Users**.

Use role assignment deliberately:

- assign `tenant` for routine POS users
- assign `manager` only where the user is responsible for station management functions
- assign `administrator` only to trusted personnel who require technical/configuration control

When a user leaves the station or should no longer have access, disable/deactivate the user promptly according to organizational policy.

Do not share named credentials. Password and session issues should be handled through the supported user administration flow rather than by creating shared fallback accounts.

## 18. Runtime Control and Maintenance

**Runtime Control** and **Maintenance** are administrator functions. They can affect active station services and forecourt behavior.

Use them only when:

- the action is understood
- the reason has been established
- active station operations have been considered
- the site's support/change procedure permits the action

Restarting a process should not be the default response to an unexplained transaction or forecourt problem. Capture diagnostics first whenever practical.

Production maintenance or dispense-control actions require the applicable site and organizational approval.

## 19. Diagnostics and Device Status

Administrators should use **Diagnostics** and **Device Status** to gather evidence before escalating an issue.

Useful evidence normally includes:

- affected station and time window
- transaction ID(s)
- pump/nozzle/tank identifiers
- whether the issue is isolated or station-wide
- current DOMS/JPL connectivity state
- printer/print-job state when relevant
- fiscal/proxy state when relevant
- exact error text and request/reference IDs

Avoid screenshots that omit timestamps, transaction IDs, or the affected device when those details are available.

## 20. Proxy and fiscal services

**Proxy Settings** is an administrator function. `vpos-ftc-app` is the station application; cloud fiscal delivery/routing is handled by `vpos-proxy`.

When fiscalization is degraded, determine whether the failure is:

- local transaction generation
- station-to-proxy connectivity/configuration
- proxy/cloud processing
- country fiscal service/device processing

Do not alter proxy URLs, credentials, fiscal device values, or Tanzania verification settings as a generic troubleshooting step.

## 21. Station Settings, Station Config, datasets, languages, and branding

These administrator pages control durable station configuration rather than daily transaction processing.

Use them under change control. In particular:

- **Station Settings / Station Config** — affects station behavior and integration settings.
- **Country Datasets** — country-specific configuration/data; do not substitute another country's dataset to bypass validation.
- **Languages** — user-facing language resources.
- **Branding** — station display name/logo presentation.

Configuration changes should be tested and recorded, and changes affecting forecourt/fiscal behavior should be scheduled appropriately.

## 22. Setup Wizard after commissioning

The **Setup Wizard** is primarily a commissioning/reconfiguration tool. It includes site profile, products, forecourt connection, PSS verification, pump mapping, printer checks, and finalization.

Do not rerun or alter setup steps on a stable production station without a defined reason. If site hardware or topology changes, use the wizard as part of the approved recommissioning process.

## 23. End-of-day / shift-handover checks

A manager should hand over unresolved operational exceptions rather than allowing them to disappear between shifts.

Recommended checks:

- review non-fiscalized transactions
- verify any pending disputed/customer transactions
- confirm required reports/daily totals
- review stock/wet-stock exceptions
- confirm significant pump/tank faults are logged
- confirm failed print jobs requiring action are known
- for Tanzania stations, complete the required fiscal daily procedure
- record any configuration or price changes made during the shift
- provide transaction IDs and diagnostic references for open support cases

## 24. Troubleshooting decision guide

| Symptom | First management action | Administrator/support action |
| --- | --- | --- |
| One transaction missing/incorrect | Search by transaction ID/pump/time and check status | Inspect diagnostics/fiscal state before recovery action |
| Many transactions not fiscalizing | Check Non-fiscalized view and establish start time | Check proxy/fiscal status and logs/diagnostics |
| One pump unavailable | Check pump state and physical forecourt condition | Check device/JPL details and mapping |
| All/many pumps stale | Treat as forecourt connectivity issue | Inspect Forecourt Monitor/Diagnostics and JPL session |
| Receipt not printed | Confirm transaction/receipt and avoid duplicate prints | Check Print Jobs and printer connectivity |
| Tank value unexpected | Compare with physical/site wet-stock evidence | Check DOMS data and tank mapping |
| Price mismatch | Stop and verify approved price source | Reconcile VPOS/PSS pricing configuration under change control |
| UI available but station degraded | Do not assume all integrations are healthy | Use health/readiness and diagnostics |

## 25. Escalation information

When escalating to technical support, provide enough information to reproduce the event without asking support to infer the station state:

- station name/identifier
- local date/time and timezone
- affected user role
- exact menu/workflow
- transaction, pump, nozzle, tank, receipt, or print-job reference as applicable
- exact error message
- whether the issue affects one item or the whole station
- last known successful time
- whether any configuration/restart/change was made immediately beforehand

## 26. Operating principles

- Preserve the original transaction record when investigating exceptions.
- Prefer diagnosis over repeated retry/restart actions.
- Keep VPOS configuration consistent with the physical site and DOMS/PSS configuration.
- Apply pricing, topology, fiscal, and runtime changes only under the appropriate authority.
- Use administrator access sparingly.
- Record unresolved exceptions at shift handover.

## 27. Related documentation

- [Technician Setup Guide](TECHNICIAN_SETUP_GUIDE.md)
- [API Guide](API_GUIDE.md)
- [Configuration](../configuration.md)
- [Forecourt and DOMS/JPL](../domains/forecourt.md)
- [Transactions and fiscalization](../domains/transactions.md)
- [Tanzania fiscalization](../domains/tanzania-fiscalization.md)
- [Forecourt recovery](../runbooks/forecourt-recovery.md)
- [Production debugging](../runbooks/production-debugging.md)
