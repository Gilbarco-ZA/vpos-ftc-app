# VPOS FTC Manager Operations & Training Manual

**Audience:** Station managers and supervisors  
**Purpose:** Single-file operational reference, practical training guide, and competency sign-off for day-to-day VPOS FTC use.

This is the primary manager-facing manual for production stations. It combines the operational reference and training content so the site does not need to switch between separate management and training documents.

Managers work entirely through the VPOS application. They do not require access to the DOMS operating system, terminal, package files, `.env` files, or technical runtime internals.

## 1. Manager role and responsibility

Managers are responsible for safe daily station operation inside the permissions exposed to the `manager` role.

Typical manager access includes:

- Dashboard
- POS-related transaction review
- Transactions
- Receipts
- Reports
- Product Stock
- Pumps
- Tanks
- Tank Levels
- Forecourt Setup
- Pump Settings
- Tank Settings
- Tank Grades
- Forecourt Pricing

Managers are not expected to perform administrator-only technical functions such as:

- package installation or rollback
- runtime service management
- proxy/fiscal endpoint administration
- user administration outside approved processes
- diagnostics/maintenance controls reserved for administrators
- TLS/certificate administration
- DOMS package-management operations
- operating-system, shell, terminal, or SSH actions

If an issue requires administrator action, escalate instead of sharing or borrowing administrator credentials.

## 2. Production operating model

VPOS FTC runs as a secure packaged application on the DOMS controller. Daily operational settings are maintained through the application where the manager has permission.

Managers should understand these boundaries:

- no terminal or SSH access is required for normal operation
- no `.env` file is used to make station adjustments
- settings such as forecourt mappings, tank configuration, pricing, and other manager-accessible parameters are maintained through VPOS screens
- package/runtime faults that cannot be resolved through the approved application workflow are escalated to technical support

## 3. Training outcome

A manager is ready for production handover when they can demonstrate all of the following without prompting:

1. sign in and navigate the manager menu
2. perform start-of-shift checks
3. find a transaction by time, pump, or reference
4. identify whether a transaction is non-fiscalized or fiscalized
5. find and reprint a receipt without creating unnecessary duplicate requests
6. identify whether a pump issue affects one pump or the whole forecourt
7. review tank levels and recognize stale/unexpected information
8. review product stock
9. explain the authorization boundary for pricing and mapping changes
10. perform end-of-shift exception handover
11. capture the evidence technical support needs when escalating an issue

## 4. Main navigation

### Daily Operations

- **POS** — station sales and transaction operations.
- **TIN Allocation** — appears where TIN capture is configured before the transaction.
- **Transactions** — search and review transaction records.
- **Receipts** — access receipt records and output workflows.
- **Reports** — management reporting.
- **Daily Totals** — Tanzania-specific daily totals where applicable.
- **Customers** — customer records.
- **Product Stock** — stock view and stock operations for management roles.

### Transaction Review

Managers have dedicated views for:

- Non-fiscalized
- Fiscalized
- Receipt Viewer
- Receipt Lookup

### Forecourt

Managers can access:

- Pumps
- Tanks
- Tank Levels

### Setup & Configuration

Managers can access operational forecourt configuration including:

- Pump Settings
- Tank Settings
- Tank Grades
- Forecourt Setup
- Forecourt Pricing

These screens can affect live station behavior. Use them only with approved source information and the applicable change process.

## 5. Start-of-shift routine

At the start of the shift:

1. Sign in and open **Dashboard**.
2. Open **Pumps** and confirm the expected forecourt is visible and not broadly stale or offline.
3. Open **Tank Levels** if wet-stock integration is used and confirm values look current and plausible.
4. Open **Transactions → Non-fiscalized** and review unresolved items carried from the previous shift.
5. Confirm a recent receipt exists and that printing is generally available.
6. Review **Product Stock** where used by the station procedure.
7. For Tanzania stations, review the required daily-total/fiscal status according to the station procedure.

If many pumps, transactions, or services appear degraded at the same time, do not start changing individual pump/tank mappings. Escalate as a station-wide issue.

> **Screenshot placeholder — start-of-shift Dashboard**  
> **File:** `docs/images/managers/manager-dashboard-start-shift.png`  
> Capture: Dashboard with enough station context to show where a manager begins daily checks. Use training or redacted data.

## 6. Finding a transaction

Use **Transactions** to search using the available information, such as:

- transaction ID/reference
- pump number
- date/time range
- transaction status
- fiscalization status
- customer/search text where supported

When investigating a complaint or exception, record the existing transaction ID first.

Do not create a new manual transaction merely because the original transaction is slow to appear.

> **Screenshot placeholder — transaction search**  
> **File:** `docs/images/managers/manager-transactions-search.png`  
> Capture: Transactions page showing search/filter controls and one synthetic/redacted example result.

## 7. Non-fiscalized transactions

A non-fiscalized transaction means the fiscal lifecycle is incomplete. It does not automatically mean the fuel sale failed.

Manager checks:

1. open the transaction
2. confirm pump, product, amount, and timestamp
3. note any visible error or reference
4. determine whether the issue affects one transaction or many
5. record the transaction ID
6. escalate if the transaction does not progress according to the station procedure

Do not repeatedly resubmit the transaction unless the approved recovery procedure explicitly requires it.

> **Screenshot placeholder — non-fiscalized queue**  
> **File:** `docs/images/managers/manager-non-fiscalized.png`  
> Capture: Non-fiscalized view with transaction status, ID/reference, and time visible using synthetic/redacted data.

## 8. Fiscalized transactions and receipt lookup

Use:

- **Fiscalized** to review completed fiscal transactions
- **Receipt Viewer** to review receipt-oriented transaction information
- **Receipt Lookup** when a known transaction/receipt reference is available

Before reprinting, verify you have the correct transaction.

> **Screenshot placeholder — receipt lookup**  
> **File:** `docs/images/managers/manager-receipt-lookup.png`  
> Capture: Receipt Lookup or Receipt Viewer showing the search/reference area and a synthetic/redacted result.

## 9. Receipt printing

If a receipt does not print:

1. confirm the correct transaction/receipt exists
2. retry only once after confirming the first request did not complete
3. check basic printer condition: power, paper, obvious offline/fault state
4. if printing still fails, capture the transaction ID and time and escalate

Administrators can inspect **Print Jobs**. Managers should not change printer IP/port configuration as the first response to a single failed print.

## 10. Reports

Use **Reports** with the correct station date/time period.

If report totals differ from a transaction search, first check:

- date/time filters
- station timezone
- transaction/fiscalization status filters
- whether the report covers the same transaction population

Do not change station timezone to force a report to match.

## 11. Tanzania Daily Totals

For Tanzania stations, **Daily Totals** is available in Daily Operations.

Follow the approved fiscal operating procedure for daily totals and exceptions.

Delayed transactions can legitimately show:

- invoice number/daily-counter date from the original transaction date
- a later Z-number/invoice date from fiscal assignment

Do not manually change counters, Z numbers, invoice numbers, or fiscal device values to resolve an individual transaction discrepancy.

## 12. Customer management

Use **Customers** to locate and maintain customer records used by station operations.

Before creating a duplicate customer, search by the known customer identifiers.

Where tax/TIN information is captured, verify it against the source supplied by the customer or the applicable station process.

Do not repurpose one customer's record for another customer merely to complete a transaction.

## 13. Product stock

Use **Product Stock** according to the station's stock-control procedure.

When values differ from expectation, consider:

- recent transactions
- deliveries
- tank/wet-stock state
- product/tank mapping
- previous manual stock operations

Escalate unexplained differences rather than forcing the balance to an expected number.

## 14. Pump operations

Open **Pumps** to review current pump state.

A manager should distinguish between:

- one dispenser/nozzle problem
- a VPOS mapping issue
- a DOMS/JPL communication problem affecting many devices
- a station-wide connectivity problem

### One pump/nozzle affected

Check:

- physical dispenser/nozzle condition
- whether only that pump is unavailable
- whether the pump identifier matches the physical pump

Escalate if the problem persists. Do not remap the pump by trial and error.

### Many/all pumps affected

Treat this as a station-wide forecourt communication issue. Capture the time the problem began and escalate.

Do not edit all pump settings or restart technical services without the approved support procedure.

> **Screenshot placeholder — Pumps**  
> **File:** `docs/images/managers/manager-pumps.png`  
> Capture: Pumps page showing healthy versus unavailable/stale status examples where safe to demonstrate.

## 15. Tanks and tank levels

Use **Tanks** and **Tank Levels** to review the physical tank estate and wet-stock information.

If a level looks wrong:

- compare against the site's known physical/wet-stock information
- check whether one tank or all tanks are affected
- note when the value was last known to be correct
- escalate before applying any stock correction

Do not use an arbitrary stock adjustment to hide a mapping or ATG problem.

> **Screenshot placeholder — Tank Levels**  
> **File:** `docs/images/managers/manager-tank-levels.png`  
> Capture: Tank Levels with representative tank identifiers, timestamps/state, and synthetic/redacted values.

## 16. Forecourt setup and configuration

Manager-accessible configuration screens can affect how VPOS interprets the physical forecourt.

Before changing:

- Pump Settings
- Tank Settings
- Tank Grades
- Forecourt Setup

confirm:

1. the physical pump/nozzle/tank involved
2. the approved DOMS/PSS identifier
3. the correct product/grade relationship
4. whether live transactions are in progress
5. the reason and authorization for the change

Do not use trial-and-error configuration during live trading.

## 17. Forecourt pricing

Managers may have access to **Forecourt Pricing**, but pricing is a controlled operational change.

Before a price change:

- confirm the approved new price
- confirm the correct product/grade
- confirm the effective time
- confirm the station's authorization/change procedure has been followed
- coordinate any signage/price-pole requirement

Afterward, verify the effective forecourt price according to the station procedure.

Do not make a price change as a test of connectivity.

> **Screenshot placeholder — Forecourt Pricing**  
> **File:** `docs/images/managers/manager-forecourt-pricing.png`  
> Capture: pricing screen with grade/product labels and synthetic/redacted prices. Do not expose a live confidential price-change instruction.

## 18. End-of-shift handover

Before handover:

- review unresolved non-fiscalized transactions
- note disputed/customer transactions still requiring action
- complete required reports/daily totals
- review significant stock/tank exceptions
- record pump/tank faults
- record failed receipt/printing issues
- record any authorized price/configuration changes
- hand over transaction IDs and support references for open incidents

An unresolved issue must be handed over with enough detail for the next manager/support person to continue without starting from zero.

## 19. What to capture before escalating

For any support case, capture:

- station name/identifier
- local time and timezone
- exact screen/workflow
- transaction ID if applicable
- pump/nozzle/tank identifier if applicable
- receipt/print reference if applicable
- exact error message
- request/reference ID if shown
- whether one item or the whole station is affected
- last known successful time
- any recent package upgrade, restart, price, PSS, printer, network, or configuration change

A screenshot is useful only if it includes the relevant identifiers and context.

## 20. Actions a manager should not take without approval

Do not:

- share administrator credentials
- attempt SSH or terminal access to the DOMS
- request changes to `.env` files
- change package files or runtime internals
- change proxy/fiscal endpoints
- change TLS/certificate settings
- change station timezone as a reporting workaround
- repeatedly restart technical services to clear unexplained faults
- remap pumps/tanks by trial and error
- apply arbitrary stock adjustments to hide mapping faults
- duplicate transactions to compensate for slow processing
- repeatedly resubmit fiscalization without checking state
- change pricing as a connectivity test
- alter Tanzania counters/receipt identifiers manually

## 21. Practical training exercises

The trainer should ask the manager to demonstrate these tasks using the approved training/test context available at the site.

### Exercise A — start-of-shift

- open Dashboard
- check Pumps
- check Tank Levels
- review Non-fiscalized transactions

**Pass condition:** manager can explain what would trigger escalation.

### Exercise B — transaction lookup

Provide a known transaction time/pump/reference and ask the manager to find it.

**Pass condition:** correct record found without creating a new transaction.

### Exercise C — receipt recovery

Ask the manager to find a known receipt/transaction and explain the reprint process.

**Pass condition:** correct transaction is confirmed before any print/reprint action.

### Exercise D — pump fault scenario

Describe a one-pump failure, then an all-pumps-stale failure.

**Pass condition:** manager distinguishes local device issue from station-wide connectivity issue and does not propose trial-and-error remapping.

### Exercise E — price change boundary

Provide a hypothetical approved price change.

**Pass condition:** manager states authorization, product/grade, effective time, and verification steps before changing pricing.

### Exercise F — support escalation

Give a sample error and ask what information should be captured.

**Pass condition:** manager captures station/time, IDs, error text, scope, and recent changes.

## 22. Manager competency sign-off

Use this checklist in the site handover/change record.

| Competency | Demonstrated | Notes |
| --- | --- | --- |
| Sign-in and navigation | ☐ | |
| Start-of-shift checks | ☐ | |
| Transaction lookup | ☐ | |
| Non-fiscalized review | ☐ | |
| Fiscalized/receipt lookup | ☐ | |
| Receipt/reprint workflow | ☐ | |
| Pump issue triage | ☐ | |
| Tank-level review | ☐ | |
| Product stock review | ☐ | |
| Pricing/change-control boundary | ☐ | |
| Forecourt configuration boundary | ☐ | |
| End-of-shift handover | ☐ | |
| Support escalation evidence | ☐ | |
| Administrator/technical boundary understood | ☐ | |
| Tanzania-specific workflow where applicable | ☐ | |

**Manager name:** ______________________________  
**Trainer/technician:** _________________________  
**Station:** ___________________________________  
**Date/time:** _________________________________  
**Training result:** Pass ☐ / Follow-up required ☐

## 23. Screenshot completion checklist

Before publishing the final training manual, replace each placeholder with an approved screenshot:

- Dashboard/start-of-shift
- Transactions search
- Non-fiscalized transactions
- Receipt Lookup/Viewer
- Pumps
- Tank Levels
- Forecourt Pricing

Screenshot rules:

- use a training/demo station where possible
- redact customer and infrastructure-sensitive information
- keep page title, relevant identifiers, and workflow controls visible
- do not capture passwords, tokens, certificate material, or other secrets
- use synthetic transaction/customer values for training wherever possible

## 24. Manager operating principles

- Preserve the original transaction when investigating an exception.
- Diagnose before retrying repeatedly.
- Keep VPOS configuration consistent with the physical site and approved DOMS/PSS configuration.
- Apply pricing and topology changes only under the appropriate authority.
- Use manager access for manager tasks; administrator access remains a technical boundary.
- No DOMS shell, SSH, `.env`, or code-level action is part of manager operation.
- Record unresolved exceptions at shift handover.
