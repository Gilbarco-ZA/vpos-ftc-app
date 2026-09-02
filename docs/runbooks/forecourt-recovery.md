# Forecourt Recovery

**Type:** runbook

1. Confirm application liveness, readiness, startup status, and worker heartbeats.
2. Inspect current JPL adapter state and recent redacted logs.
3. Determine whether the fault is connectivity, protocol state, mapping, alarm state, or transaction reconciliation.
4. Avoid restarting multiple competing processes until process ownership is confirmed.
5. Preserve transaction and buffer evidence before clearing or replaying state.
6. Use read-only diagnostics before any maintenance write.
7. Verify recovered pump/tank state and transaction consistency after intervention.
8. Record the incident, commands executed, and resulting controller state.

Never issue an unreviewed maintenance or dispense command solely to test connectivity.

## Transactions buffered before station configuration

If DOMS already contains transactions when VPOS is first installed, do not delete the local transaction and do not manually release a foreign DOMS lock.

1. Import the station PSS XML and verify that products, tanks, pumps, and nozzles were created with their DOMS identifiers.
2. The import invalidates the DOMS pump-mapping cache and, when JPL is connected, immediately reconciles the supervised and unsupervised transaction buffers.
3. VPOS must leave any still-unmapped or ambiguously mapped transaction in the DOMS buffer. It may clear the controller entry only after the matching DOMS transaction identity has been durably captured locally.
4. For a local transaction that previously reached `FAILED` because fiscal fields were missing, use **Retry fiscalization** after configuration is complete. DOMS/JPL transactions may be retried without linking a customer; the fiscal payload is enriched again from the current pump → nozzle → tank → product topology.
5. Confirm that the same transaction/POS reference reaches the expected fiscal status and that the corresponding DOMS buffer checkpoint reaches `cleared`. Do not create a replacement transaction merely to recover the sale.

If retry still reports the same missing product/topology fields, verify the imported nozzle-to-tank and tank-to-product relationships before attempting another retry.

If diagnostics or the transaction list show two local rows for one physical sale (for example, one `forecourt:` POS reference and one short JPL-generated POS reference), do not fiscalize or delete a replacement row as a repair. Current ingestion serializes pump-session and JPL-buffer capture and links matching observations to one canonical transaction. Preserve older duplicate fiscal records for controlled reconciliation rather than automatically deleting or merging already-issued documents.

## Fiscalized locally but transaction remains in the DOMS buffer

Treat DOMS as authoritative for whether the controller buffer entry has actually been cleared. A local `FISCALIZED` transaction or a previous local `cleared` checkpoint does not prove that the PSS accepted and applied the clear.

1. Confirm the current DOMS buffer pointer: source mode, `FpId`, `TransSeqNo`, and `TransLockId`. Do not assume that `(FpId, TransSeqNo)` identifies the same historical sale forever: `TransSeqNo` rolls over and starts again at `0001` after a Master Reset. Compare the current transaction read (`FinishDate`/`FinishTime` where available) and the controller Master Reset timestamp with the local transaction/checkpoint before reusing historical state.
2. For a supervised ETS transaction, VPOS must first have collected the transaction and must clear it with `clear_FpSupTrans_req` SUBC `04H`, using the same `FpId`, owning `PosId`, `TransSeqNo`, `Vol_e`, and `Money_e`. Always include `PaymentParameters: {}`. The deployed PSS/JTM rejects the clear at the JPL syntax layer when `PaymentParameters` is omitted; the current integration keeps the payment group present while omitting `ReferenceNo` so JTM does not encode an explicit zero-length ARRAY[BYTE].
3. After the clear response, re-read the matching supervised or unsupervised transaction-buffer status. Only mark the local checkpoint `cleared` when the exact `TransSeqNo` is no longer present. If it remains present, treat the clear as failed/retryable and retain the evidence.
4. After deploying a release with this verification, restart the FTC application or run its transaction-buffer reconciliation. A transaction left behind by an older release is rediscovered from DOMS. If the controller read belongs to the same physical sale, local ingestion reuses the existing transaction. If the DEC4 sequence has been reused after rollover/reset, VPOS creates a new transaction incarnation instead of overwriting the historical fiscalized row.
5. If the transaction is locked by a different POS, do not automatically force-release it with POS ID `00`. Preserve the lock evidence and perform the approved operator/field recovery procedure.

For incident evidence, capture the outbound clear request (with sensitive fields redacted), its JPL response or reject, and the subsequent buffer-status response showing whether the sequence disappeared.

If `clear_FpSupTrans_req` SUBC `04H` is rejected, inspect the exact outbound clear shape before changing lock or replay logic. Although the generic vendor `@gilbarcoafs/doms-pos-jpl` schema permits the payment group to be absent, the deployed PSS/JTM has been observed to reject such a request with `RejectCode = 02H` and `RejectInfoText = Property "PaymentParameters" is missing` before DPP conversion. VPOS must therefore send `PaymentParameters: {}` on every supervised ETS clear. The previously tested `ReferenceNo: []` form passed JTM property validation but was rejected by the PSS with `0031H/04H + 02H/09H Wrong rx_size`; do not substitute `[0]`, propagate an arbitrary transaction reference, or pad/probe reference bytes against a live controller. If the controller still returns that PSS-level reject with the empty payment object, preserve the evidence and keep the checkpoint fail-closed.

Current FTC releases quarantine the exact deterministic `0031H/04H + 02H/09H` clear reject after the first failure in a JPL session. `@gilbarcoafs/doms-pos-jpl` exposes the structured reject as `RejectError.details.raw`; classification must use that envelope even though `Error.message` is only `Wrong rx_size`. The transaction remains in DOMS and its checkpoint remains failed/retryable, but automatic buffer polling must not repeatedly resend the same invalid clear. A newly established JPL session or a confirmed PSS configuration refresh resets the quarantine. A live manual recovery run also resets it deliberately; use that only after the suspected protocol/configuration cause has changed. The support bundle includes the current quarantine entries and a read-only `pssReferenceLengthDiagnostics` section derived from the imported PSS XML, including the source checksum and any discovered `MlenReferenceNo`/reference-length values.

If the transaction is already present/fiscalized locally but diagnostics show `clearAttempts: 0`, inspect ingestion/lifecycle persistence before changing the DOMS clear envelope. A successful transaction upsert is not sufficient for replay safety if checkpoint/replay ownership correlation fails afterward; the ingestion path must return a persisted transaction ID and advance the replay/checkpoint to `captured` before `clear_FpSupTrans_req` is eligible to send.

## Buffer entry reads successfully but capture is deferred

When diagnostics show `FpSupTrans_resp` or `FpUnSupTrans_resp` with transaction values but the application logs `nozzle mapping is ambiguous or missing`, inspect the transaction parameters exactly as returned by JPL. Requested transaction properties are nested under `TransPars`; `FcGradeId` and `FpGradeOptionNo` must be read from that object. Prefer `FpGradeOptionNo`/explicit nozzle evidence. Use `FcGradeId` alone only when it resolves to exactly one configured nozzle. If multiple nozzles share the same grade, leave the transaction buffered until the grade option or nozzle can be resolved; never select the first matching nozzle.
