# DOMS/JPL wash transaction capture

This pass adds a durable capture layer for DOMS wash point transactions. It does not automatically execute wash transaction clears; it prepares clear candidates and exposes review state for future operator-controlled automation.

## Protocol behaviour

DOMS wash transactions are unsupervised transactions. The wash sale is paid before service delivery, and a prepay receipt is produced. A zero-value wash transaction must be handled with the same operational care as a prepaid fuel transaction.

`WpStatus_resp` can include `WpTransInUnsBuffer` entries. These entries identify pending wash transactions by `WpTransSeqNo`, service mode, lock id, transaction info mask, and money. The application now snapshots those entries and persists them to `forecourt_jpl_wash_transactions`.

When a full `WpUnSupTrans_resp` is received, the application extracts:

- wash point id (`WpId`)
- transaction sequence number (`WpTransSeqNo` or `TransSeqNo`)
- POS id / lock id
- money used for clearing
- wash program / `FcWashId`
- auth id and start/finish date-time fragments
- termination status and transaction error code
- wash options and return data

The clear candidate is stored as a validated internal envelope shape:

```json
{
  "name": "clear_WpUnSupTrans_req",
  "subCode": "00H",
  "data": {
    "WpId": "12",
    "PosId": "01",
    "TransSeqNo": "1234",
    "Money": "123456"
  }
}
```

## Safety rules

The clear candidate is only generated when `WpId`, `PosId`, `TransSeqNo`, and `Money` are present. Missing fields block the row with `review_status = needs_review` and `clear_status = blocked`.

A zero-money transaction is classified as `zero_transaction_review`. The DOMS protocol allows these cases, but the POS must treat them deliberately because they represent prepaid-style transaction handling.

## Operator visibility

The production workflow review page now includes wash transaction clear candidates. It shows pending clear counts, recent captured wash transactions, zero/error review rows, and current clear lifecycle status.

## Remaining field work

Before enabling automatic clearing for wash transactions, validate the full wash flow against a DOMS/PSS controller at a site that actually uses wash control. Confirm the POS id locking behaviour, zero-transaction behaviour, and wash receipt/payment mapping with site-specific configuration.
