# Tanzania fiscal parity validation

This document describes the FTC-side validation added for the remaining `vpos-fiscal-tz` parity checks. It is a support and release-gate layer; it does not call TRA or EWURA by itself.

## Purpose

`vpos-fiscal-tz` stores reference behavior in XML templates, payload builders, queue files, and report archives. FTC now builds the same Tanzania fiscal surfaces from database-backed services. The parity validator codifies the reference package shapes so support can check generated payloads before endpoint submission or during field acceptance.

The validation layer lives in:

- `src/modules/tanzania-fiscal/infrastructure/parityValidation.ts`
- `tests/tanzania-fiscal/tanzaniaParityValidation.test.ts`

## TRA receipt shape checks

The receipt validator compares generated FTC XML against the TRA receipt structure used by the reference package examples:

- `EFDMS/RCT` envelope
- receipt date and time
- taxpayer and VFD registration fields
- customer identity fields
- `RCTNUM`, `DC`, `GC`, `ZNUM`, and `RCTVNUM`
- item records with `ID`, `DESC`, `QTY`, `TAXCODE`, and `AMT`
- totals, payments, VAT totals, and signature node

The validator also checks that `RCTNUM` and `GC` match. This preserves the reference behavior where the receipt number is the global fiscal counter and retries must reuse the same counter tuple.

## TRA z-report shape checks

The z-report validator checks the daily close payload shape against the reference package examples:

- `EFDMS/ZREPORT` envelope
- header lines
- VRN/TIN/tax office/REGID/ZNUMBER/EFDSERIAL
- registration/user/SIMIMSI fields
- daily and gross totals
- VAT totals
- payment buckets
- change counters
- firmware/checksum fields
- signature node

This catches missing daily close fields before a station attempts live TRA z-report submission.

## EWURA NPGIS shape checks

The EWURA validator checks the three official EFPP XML roots used by the reference package:

- `RetailStationRegistration`
- `RetailerSaleTransaction`
- `StationDaySummaryReport`

Each validator confirms the `NPGIS` envelope, `APISourceId`, `EWURALicenseNo`, payload-specific required fields, and `VendorSignature` node.

## Counter and fiscal-day checks

The counter validator enforces FTC's database-backed replacement for the reference package's file-backed counter behavior:

- receipt number must match global count
- global count must not be reused across different fiscal receipts
- a retry of the same transaction must reuse the original receipt/global/daily/ZNUM tuple
- daily count must be unique per fiscal day except for an idempotent retry of the same transaction
- ZNUM must use the `YYYYMMDD` fiscal-day key
- fiscal-day summaries expose min/max daily and global counters for support review

The z-report boundary validator checks that a daily close includes all receipts for the target ZNUM and that the z-report fiscal ticket count matches the last daily receipt counter.

## Recommended acceptance use

During a field validation rehearsal, generate representative sale, credit-note, z-report, EWURA sales, and EWURA inventory payloads in simulator mode and pass the XML through the shape validators. Live endpoint validation is still required for final acceptance, but these checks catch local payload drift before credentials or endpoint availability become the blocker.
