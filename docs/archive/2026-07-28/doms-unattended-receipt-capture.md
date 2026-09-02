# DOMS/JPL Unattended Receipt Capture

## Purpose

This pass hardens unattended DOMS/JPL transaction handling for sites that clear outdoor payment transactions through `clear_FpUnSupTrans_req` using the Extended Transaction Size / forecourt receipt variant.

The implementation does four things:

1. Captures EPT receipt metadata from unattended transaction payloads.
2. Uses the captured receipt payload when building `clear_FpUnSupTrans_req` SUBC `03H` requests.
3. Persists sanitized receipt/payment metadata for operational audit and reconciliation.
4. Redacts sensitive card/payment fields before writing JPL traffic logs or replay checkpoints.

## Why this matters

For unattended card or BankNote sales where receipts are printed at the forecourt, DOMS expects the transaction clear request to include the receipt format and receipt items. Without that data the controller can reject the clear, or the POS can lose the operational link between the DOMS transaction, EPT sequence, receipt number, and local transaction record.

The implementation deliberately keeps raw EPT receipt data available only in the outbound clear request. Stored records and logs retain operational metadata such as EPT ID, EPT sequence number, receipt number, selected device ID, masked PAN, and card label, but redact sensitive fields such as full card numbers, track data, PIN blocks, encrypted payloads, tokens, keys, passwords, and secrets.

## Main files

| Area                                          | File                                                                                |
| --------------------------------------------- | ----------------------------------------------------------------------------------- |
| Receipt extraction / redaction                | `src/modules/forecourt/infrastructure/jpl/unattendedTransactions.ts`                |
| Unsupervised clear request selection          | `src/modules/forecourt/infrastructure/jpl/transactionService.ts`                    |
| Replay capture and checkpoint persistence     | `src/modules/forecourt/infrastructure/jpl/replay.ts`                                |
| JPL traffic-log redaction                     | `src/modules/forecourt/infrastructure/jpl/logging.ts`                               |
| Transaction persistence                       | `src/modules/forecourt/infrastructure/repositories/forecourtJplTransactionsRepo.ts` |
| Forecourt event transaction audit persistence | `src/modules/forecourt/infrastructure/persistence.ts`                               |
| Schema migration                              | `scripts/migrations/postgres/1200_jpl_unattended_receipt_capture.sql`               |
| Admin workflow visibility                     | `components/admin/forecourt/JplWorkflowReviewPanel.tsx`                             |
| Unit tests                                    | `tests/forecourt/domsUnattendedTransactions.test.ts`                                |

## Stored transaction metadata

The following nullable columns are added to both `transactions` and `forecourt_transactions`:

- `doms_external_payment_reference`
- `doms_ept_id`
- `doms_ept_sequence_no`
- `doms_ept_receipt_format_id`
- `doms_receipt_no`
- `doms_card_label`
- `doms_card_pan_masked`
- `doms_unattended_receipt_json`
- `doms_unattended_payment_json`

These fields are intentionally operational and reconciliation-oriented. They should not be treated as a replacement for acquiring-bank settlement data.

## Extraction behavior

`extractJplUnattendedReceiptCapture()` accepts a DOMS/JPL transaction payload and looks for receipt data in the following locations:

1. `EptReceiptItems` on the root payload.
2. `TransPars.EptReceiptItems`.
3. `PaymentParameters.EptReceiptItems`.

It also looks for `EptReceiptFormatId`, `EptId`, `EptSeqNo`, `ReceiptNo`, `SelectedDeviceId`, `TillSequenceNumber`, card labels, masked PAN data, validation result, and POS reject code across the root payload, `TransPars`, and receipt items.

When no explicit external payment reference is present, the helper derives a stable reference from available DOMS metadata:

```text
EPT:<EptId>|SEQ:<EptSeqNo>|RCP:<ReceiptNo>|DEV:<SelectedDeviceId>|TILL:<TillSeqNo>
```

## Clear request behavior

`buildClearUnsupervisedTransactionRequest()` now selects:

- SUBC `00H` for plain unsupervised clears without receipt data.
- SUBC `03H` when extended amounts and/or EPT receipt data are present.

For SUBC `03H`, it includes:

- `Vol_e` when available.
- `Money_e` when available.
- `EptReceiptFormatId` padded to DOMS ID2 format.
- Raw `EptReceiptItems` from the transaction payload or prepared clear payload.

Raw `EptReceiptItems` are preserved only for the outbound request because DOMS needs the original receipt fields. Persistence and logs use redacted copies.

## Replay and checkpoint behavior

During unattended replay:

1. The transaction is read and locked.
2. Receipt/payment capture metadata is extracted.
3. The read payload and clear payload are persisted to checkpoints in redacted form.
4. The local transaction rows are updated with sanitized DOMS EPT metadata.
5. The clear request is submitted using SUBC `03H` when the receipt data requires it.

If receipt data is incomplete, replay still records warnings on the checkpoint so operators can see why the clear may fail or why the receipt audit trail is incomplete.

## Admin workflow visibility

The JPL production workflow panel now includes:

- In-memory DOMS backlog depth.
- Pending clear count.
- Stale lock count.
- Failed clear count.
- Active checkpoint count.
- Recent DOMS transaction captures with EPT ID, EPT sequence, receipt number, masked card indicator, and external payment reference.

## Operational notes

- Never log full card numbers or track data.
- Treat `doms_card_pan_masked` as display-only audit metadata.
- If a live controller rejects SUBC `03H`, inspect the checkpoint `lastError`, redacted `clearPayloadJson`, and whether `EptReceiptFormatId` and `EptReceiptItems` were captured.
- For sites without forecourt receipt printers, plain SUBC `00H` unsupervised clears remain supported.
