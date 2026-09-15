# VPOS FTC Manager Training Guide

**Audience:** Station managers and supervisors  
**Purpose:** Practical on-site training and competency sign-off for day-to-day VPOS FTC operation  
**Repository baseline:** `main` commit `03cc45e6bb7c09d01994f2d98743dfb346bfc520` (2026-09-11)

This guide is designed to be used during site handover. It focuses on the tasks a manager is expected to perform, how to identify problems early, and when to escalate instead of changing technical configuration.

For detailed operational reference, use the [Management Guide](MANAGEMENT_GUIDE.md).

> **Screenshot convention:** placeholders in this guide identify the production screenshots still required before publication. Approved images should be stored under `docs/images/managers/` and captured/redacted according to [Documentation Screenshot Assets](../images/README.md).

## 1. What a manager is responsible for

Managers are responsible for safe daily station operation inside the permissions exposed to the `manager` role. Typical access includes:

- Dashboard
- POS-related transaction review
- Transactions and Receipts
- Reports
- Product Stock
- Pumps
- Tanks and Tank Levels
- Forecourt Setup
- Pump Settings
- Tank Settings
- Tank Grades
- Forecourt Pricing

Managers are **not** expected to perform administrator-only tasks such as:

- changing runtime services
- editing proxy/fiscal endpoints
- changing station-level security/runtime configuration
- using diagnostics/maintenance controls that require administrator access
- changing country datasets
- modifying users outside approved administration

If the station requires an administrator action, escalate rather than borrowing or sharing administrator credentials.

## 2. Training outcome

A manager is ready for production handover when they can demonstrate all of the following without prompting:

1. sign in and navigate the manager menu
2. perform start-of-shift checks
3. find a transaction by time/pump/reference
4. identify whether a transaction is non-fiscalized or fiscalized
5. find and reprint a receipt without creating unnecessary duplicate print attempts
6. identify whether a pump issue affects one pump or the whole forecourt
7. review tank levels and recognize stale/unexpected information
8. understand that pricing and mapping changes require controlled authorization
9. perform end-of-shift exception handover
10. capture the information support needs when escalating an issue

## 3. Start-of-shift routine

At the start of the shift:

1. Open **Dashboard**.
2. Open **Pumps** and confirm the expected forecourt is visible and not broadly stale/offline.
3. Open **Tank Levels** if wet-stock integration is used and confirm values look current and plausible.
4. Open **Transactions → Non-fiscalized** and review unresolved items carried from the previous shift.
5. Confirm a recent receipt exists and that printing is generally available.
6. Review **Product Stock** where used by the station procedure.
7. For Tanzania stations, review the required daily-total/fiscal status according to the station procedure.

> **Screenshot placeholder — `manager-dashboard-start-shift.png`**  
> Capture the manager Dashboard with the left navigation visible and enough station status context to orient a new manager. Use synthetic/redacted station data.

If many pumps, transactions, or services appear degraded at the same time, do not start changing individual pump/tank mappings. Escalate as a station-wide issue.

## 4. Finding a transaction

Use **Transactions** to search using the information available, such as:

- transaction ID/reference
- pump number
- date/time range
- transaction status
- fiscalization status
- customer/search text where supported

> **Screenshot placeholder — `manager-transactions-search.png`**  
> Capture the Transactions search/filter view with transaction ID, pump, date/time, and status filters visible. Do not expose real customer data.

When investigating a complaint or exception, record the existing transaction ID first.

Do not create a new manual transaction merely because the original transaction is slow to appear.

## 5. Non-fiscalized transactions

A non-fiscalized transaction means the fiscal lifecycle is incomplete. It does **not** automatically mean the fuel sale failed.

Manager checks:

1. open the transaction
2. confirm pump, product, amount, and timestamp
3. note any visible error or reference
4. confirm whether the issue affects one transaction or many
5. record the transaction ID
6. escalate if the transaction does not progress according to the station procedure

> **Screenshot placeholder — `manager-non-fiscalized.png`**  
> Capture the Non-fiscalized transaction list/detail with the transaction reference, pump, amount, timestamp, fiscal status, and any user-visible error/reference in frame. Use synthetic/redacted values.

Do not repeatedly resubmit the transaction unless the approved recovery procedure explicitly instructs you to do so.

## 6. Fiscalized transactions and receipt lookup

Use:

- **Fiscalized** to review completed fiscal transactions
- **Receipt Viewer** to review receipt-oriented transaction information
- **Receipt Lookup** when a known transaction/receipt reference is available

> **Screenshot placeholder — `manager-receipt-lookup.png`**  
> Capture Receipt Lookup or Receipt Viewer with the lookup field, transaction/receipt reference, and print/reprint action visible. Ensure customer/tax data is synthetic or redacted.

Before reprinting, verify you have the correct transaction.

## 7. Receipt printing

If a receipt does not print:

1. confirm the correct transaction/receipt exists
2. retry only once after confirming the first request did not complete
3. check basic printer condition: power, paper, obvious offline/fault state
4. if printing still fails, capture the transaction ID and time and escalate

Administrators can inspect **Print Jobs**. Managers should not change printer IP/port configuration as the first response to a single failed print.

## 8. Pump problems

### One pump/nozzle affected

Check:

- physical dispenser/nozzle condition
- whether that pump alone is unavailable
- whether the pump identifier matches the physical pump

> **Screenshot placeholder — `manager-pumps.png`**  
> Capture the Pumps view showing several pump states so the difference between a single-pump fault and a wider forecourt problem is visually clear. Use a safe demonstration state; do not induce a production fault for the screenshot.

Escalate if the problem persists. Do not remap the pump by trial and error.

### Many/all pumps affected

Treat this as a forecourt communication/station-wide issue. Capture the time the problem started and escalate to support/administrator.

Do not edit all pump settings or restart equipment without the approved support procedure.

## 9. Tanks and tank levels

Use **Tanks** and **Tank Levels** to review the physical tank estate and wet-stock information.

> **Screenshot placeholder — `manager-tank-levels.png`**  
> Capture Tank Levels with tank identifier, product/grade, level/volume, and freshness/timestamp context visible. Use synthetic/redacted site identifiers.

If a level looks wrong:

- compare against the site's known physical/wet-stock information
- check whether one tank or all tanks are affected
- note when the value was last known to be correct
- escalate before applying any stock correction

Do not use an arbitrary stock adjustment to hide a mapping or ATG problem.

## 10. Product stock

Use **Product Stock** according to the station's stock-control procedure.

When values differ from expectation, consider:

- recent transactions
- deliveries
- tank/wet-stock state
- product/tank mapping
- previous manual stock operations

Escalate unexplained differences rather than forcing the balance to an expected number.

## 11. Forecourt pricing

Managers may have access to **Forecourt Pricing**, but pricing is a controlled operational change.

Before a price change:

- confirm the approved new price
- confirm the correct product/grade
- confirm the effective time
- confirm the station's authorization/change procedure has been followed
- coordinate any signage/price-pole requirement

> **Screenshot placeholder — `manager-forecourt-pricing.png`**  
> Capture Forecourt Pricing with product/grade, current price, proposed/new price control, and save/apply boundary visible. Use obviously synthetic values or a non-production station; never change live pricing just to create documentation.

Afterward, verify the effective forecourt price according to the station procedure.

Do not make a price change as a test of connectivity.

## 12. Pump/tank/forecourt configuration

Manager-accessible configuration screens can affect how VPOS interprets the physical forecourt.

Before changing:

- Pump Settings
- Tank Settings
- Tank Grades
- Forecourt Setup

confirm the physical/PSS source information and change authorization.

Do not use trial-and-error configuration during live trading.

## 13. Reports

Use **Reports** with the correct station date/time period.

If report totals differ from a transaction search, first check:

- date/time filters
- station timezone
- transaction/fiscalization status filters
- whether the report covers the same transaction population

Do not change station timezone to force a report to match.

## 14. Tanzania-specific operating points

For Tanzania stations:

- **Daily Totals** appears when the station country is Tanzania.
- Follow the approved fiscal operating procedure for daily totals and exception handling.
- Delayed transactions can legitimately show an invoice/daily-counter date from the original transaction date and a later Z-number/invoice date from fiscal assignment.

Do not manually change counters, Z numbers, invoice numbers, or fiscal device values for a single transaction discrepancy.

## 15. End-of-shift handover

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

## 16. What to capture before escalating

For any support case, capture:

- station name/identifier
- local time and timezone
- exact screen/workflow
- transaction ID if applicable
- pump/nozzle/tank identifier if applicable
- receipt/print reference if applicable
- exact error message
- `requestId` if shown
- whether one item or the whole station is affected
- last known successful time
- any recent restart, deployment, price, PSS, printer, network, or configuration change

A screenshot is useful only if it includes the relevant identifiers and timestamp/context.

## 17. Actions a manager should not take without approval

Do not:

- share administrator credentials
- change proxy/fiscal endpoints
- change TLS/certificate settings
- change station timezone as a reporting workaround
- repeatedly restart services to clear unexplained faults
- remap pumps/tanks by trial and error
- apply arbitrary stock adjustments to hide mapping faults
- duplicate transactions to compensate for slow processing
- repeatedly resubmit fiscalization without checking state
- change pricing as a connectivity test
- alter Tanzania counters/receipt identifiers manually

## 18. Practical training exercises

The trainer should ask the manager to demonstrate these tasks in the training/test context available at the site:

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

**Pass condition:** correct transaction is confirmed before print/reprint action.

### Exercise D — pump fault scenario

Describe one-pump failure, then all-pumps-stale failure.

**Pass condition:** manager distinguishes local device issue from station-wide connectivity issue and does not propose trial-and-error remapping.

### Exercise E — price change boundary

Provide a hypothetical approved price change.

**Pass condition:** manager states authorization, product/grade, effective time, and verification steps before changing pricing.

### Exercise F — support escalation

Give a sample error and ask what information should be captured.

**Pass condition:** manager captures station/time, IDs, error text, scope, and recent changes.

## 19. Manager competency sign-off

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
| End-of-shift handover | ☐ | |
| Support escalation evidence | ☐ | |
| Administrator boundary understood | ☐ | |
| Tanzania-specific workflow where applicable | ☐ | |

**Manager name:** ______________________________  
**Trainer/technician:** _________________________  
**Station:** ___________________________________  
**Date/time:** _________________________________  
**Training result:** Pass ☐ / Follow-up required ☐

## 20. Screenshot capture checklist

Before manager training documentation is considered publication-ready, replace these placeholders with approved images:

| Screenshot | Purpose | Status |
| --- | --- | --- |
| `manager-dashboard-start-shift.png` | orientation/start-of-shift | ☐ |
| `manager-transactions-search.png` | transaction lookup | ☐ |
| `manager-non-fiscalized.png` | fiscal exception review | ☐ |
| `manager-receipt-lookup.png` | receipt lookup/reprint | ☐ |
| `manager-pumps.png` | pump-state triage | ☐ |
| `manager-tank-levels.png` | wet-stock review | ☐ |
| `manager-forecourt-pricing.png` | controlled pricing workflow | ☐ |

Follow [Documentation Screenshot Assets](../images/README.md) for redaction and capture rules.

## 21. Related documentation

- [VPOS FTC Management Guide](MANAGEMENT_GUIDE.md)
- [Technician Setup Guide](TECHNICIAN_SETUP_GUIDE.md)
- [Production Debugging](../runbooks/production-debugging.md)
- [Commissioning](../runbooks/commissioning.md)
