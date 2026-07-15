# DOMS Operational Readiness

This pass adds an operator-facing readiness rollup for the DOMS/JPL runtime. It converts the raw runtime snapshot, parsed domain state, and field-validation release gate into a short action queue that can be reviewed without reading raw JPL payloads.

## Scope

The readiness model is exposed through:

- `GET /api/admin/forecourt/operational-readiness`
- `src/modules/forecourt/application/getDomsOperationalReadiness.ts`
- `components/admin/forecourt/JplOperationalReadinessPanel.tsx`

The rollup is diagnostic and operator-facing. It does not send JPL commands, clear DOMS buffers, change FTC mappings, or bypass the existing hard-disabled PSS write execution gate.

## Readiness sections

The readiness response groups checks into these sections:

1. **Connection and session**
   - offline socket
   - incomplete `FcLogon`
   - stale inbound traffic / heartbeat timeout
   - recent rejects
   - framing diagnostics

2. **Forecourt controller**
   - hardware/software incompatibility
   - RTC error
   - fallback mode
   - stored-transaction restriction
   - service-log and BOR-ready flags

3. **Dispense control**
   - no observed pump status
   - pump errors / estop indicators
   - warning/offline pump state

4. **Wetstock and delivery**
   - no observed tank status
   - tank error/warning state
   - delivery clear candidates

5. **Optional modules**
   - price-pole, wash, DIO, sensor, and vending warning/error state

6. **Service-log and BOR processing**
   - recently collected service-log records
   - recently collected Back Office Records

7. **Field-validation release gate**
   - blocks production when latest required validation evidence has not passed

## Status model

Each section has one of the following statuses:

- `ready`: no action items in that section.
- `degraded`: warning-level action items exist, but no critical section blockers were found.
- `blocked`: at least one critical action item exists.

The top-level `overallStatus` is the maximum section severity. Live operations are only marked as allowed when all sections are `ready`.

## Operator decision

The API includes an `operatorDecision` object with:

- `canProceedWithLiveOperations`
- `canProceedWithCommissioning`
- `requiresFieldEngineer`
- `nextBestAction`

This is intended for the admin Forecourt page. It gives support and field teams a single place to see the highest priority operational blocker before reviewing detailed diagnostics.

## Why this was added

Earlier passes completed broad DOMS/JPL capture and normalization: transactions, service logs, BORs, wetstock, optional modules, and response parsing. The remaining risk was that several UI/admin surfaces still required a user to interpret raw protocol flags. This pass adds a stable readiness abstraction so future UI and release workflows can depend on internal domain signals instead of protocol field names.

## Acceptance notes

Before first live-site acceptance, the readiness panel should show:

- `overallStatus = ready`
- zero blocking actions
- no critical connection/session items
- no Forecourt Controller hardware/software incompatibility or RTC error
- no pump/tank critical actions
- field-validation release gate passed

Warnings may be acceptable during commissioning only when they are expected, documented, and recorded as validation evidence.
