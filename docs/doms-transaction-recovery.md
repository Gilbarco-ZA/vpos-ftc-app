# DOMS/JPL transaction-buffer recovery

This note documents the recovery policy for supervised and unsupervised DOMS
transaction buffers. Recovery retries a clear only when the app has durable
state sufficient to identify the transaction and construct the required clear
request safely.

## Identity and concurrency

The durable and in-process transaction identity is:

```text
stationId : sourceMode : FpId : TransSeqNo
```

Per-pump replay serialization is scoped by station, source mode, and fuelling
point. This prevents concurrent read/lock/clear sequences for the same buffer
while allowing unrelated stations and pumps to continue independently.

Recovery uses station-scoped single-flight execution. Duplicate recovery
requests for one station share the same run; different stations do not block
each other.

## Recoverable lifecycle states

The recovery sweep considers checkpoints in these states:

- `read_locked`
- `captured`
- `clear_requested`
- `failed`

Normal transaction-buffer polling owns initial discovery, read/lock, capture,
and the first clear attempt. Recovery handles timeouts, lost clear responses,
and process restarts after durable capture.

## Lock ownership policy

| Lock state                                            | Automatic behavior                         |
| ----------------------------------------------------- | ------------------------------------------ |
| Empty or `00`                                         | Read, persist, then clear.                 |
| Owned by configured POS with durable clear payload    | Resume clear from the checkpoint.          |
| Owned by configured POS without durable clear payload | Unlock using the same POS ID, then reread. |
| Owned by another POS                                  | Record `blocked_by_foreign_pos` and stop.  |

The protocol permits `ID_ZERO` to release a transaction lock regardless of the
original owner. This implementation deliberately does not use that capability
automatically.

`PosId=00` / `ID_ZERO` is allowed only through a future explicit recovery
workflow after all of the following are true:

1. the transaction has been durably captured or independently verified;
2. the active POS owner has been confirmed unavailable;
3. the operator has field-engineer authorization;
4. the exact fuelling point and sequence number have been reviewed;
5. the action and result are written to the recovery audit trail.

## Buffer-status variants

Startup reconciliation requests transaction-buffer status in this order:

1. `03H` extended transaction size;
2. `01H` grade-aware pointer data;
3. `00H` legacy pointer data.

Fallback occurs only for an unsupported or syntax-rejected subcode. Access
denials and operational errors are not treated as compatibility fallbacks.
Solicited and unsolicited events preserve the actual response subcode.

## Durable payload handling

Checkpoint storage keeps read and clear payloads separately. Recovery accepts
both the current data-only clear payload and legacy checkpoints where the data
was nested inside a full JPL request envelope.

For unattended transactions, persisted receipt data is sanitized before it is
stored. The recovery clear builder reconstructs the protocol request from the
checkpoint payload and the configured POS ID.

## Persistence safety

The in-memory seen set is updated only after durable transaction persistence.
A failed write remains retryable. Database uniqueness remains the final guard
against duplicate transaction creation across process restarts.

A clear success updates:

- the transaction's DOMS cleared timestamp;
- the replay/checkpoint lifecycle to `cleared`;
- per-pump buffer health;
- the station-scoped in-memory seen set.

## UI and API

- UI: `components/admin/forecourt/JplWorkflowReviewPanel.tsx`
- API: `POST /api/admin/forecourt/transactions/recovery`
- Application service: `runJplTransactionRecovery`
- Runtime sweep: `runJplTransactionRecoverySweep`

Live manual recovery requires the confirmation value
`RECOVER_DOMS_TRANSACTIONS`. A dry-run sends no clear commands.

## Local verification

Run the replay-specific checks with:

```bash
npm run doms:jpl-replay:selftest
```

The suite verifies station isolation, lock ownership decisions, lock queue
cleanup, single-flight behavior, retry release, buffer subcode preservation,
extended values, and empty buffers.

## Field validation checklist

Before using live recovery on a site, confirm:

1. The JPL adapter is connected and logged on with the intended unique POS ID.
2. The target checkpoint has the correct station, source mode, FpId, and
   TransSeqNo.
3. A durable clear payload exists, or the same-POS unlock/reread path is safe.
4. The row is not owned by another active POS.
5. The transaction is already represented in the app database where required.
6. A dry-run selects only the intended rows.
7. Live recovery is run once, then buffer status is re-polled.
8. The checkpoint moves to `cleared` and the transaction receives a DOMS
   cleared timestamp.
9. No `ID_ZERO` action is performed without the separate authorized field
   procedure.
