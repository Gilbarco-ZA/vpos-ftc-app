# Tanzania fiscal output and simulator utilities

This note documents the FTC-native replacement for the `vpos-fiscal-tz` printer and simulator behavior. The implementation is deliberately driver-neutral and endpoint-neutral so field teams can validate payloads without connecting to a physical printer or live TRA/EWURA endpoints.

## Output renderer

`src/modules/tanzania-fiscal/infrastructure/fiscalOutput.ts` renders fiscal output as UTF-8 text lines:

- `renderTraReceiptOutput()` for TRA fiscal receipts and receipt copies.
- `renderTraZReportOutput()` for daily TRA z-report output.
- `renderTraRegistrationUpdateOutput()` for registration-change notices.
- `renderTraStatusOutput()` for TRA control/status change notices.

The renderer mirrors the reference package output categories: station header, customer block, receipt or z-report identifiers, item lines, totals, payment lines, VAT lines, verification code, and verification URL. It does not open sockets, COM ports, or printer drivers. The returned `text`, `lines`, `contentType`, and `metadata` can be passed to a physical printer integration, a PDF generator, an admin preview card, or a support export.

## Simulator harness

`src/modules/tanzania-fiscal/infrastructure/fiscalSimulator.ts` provides deterministic simulator behavior for developer and field validation:

- `createTanzaniaFiscalSimulatorState()` creates a seeded station/tank state.
- `buildTanzaniaSimulatorSale()` emits a deterministic FTC-style sale transaction and updates tank levels.
- `buildSimulatedTraTokenResponse()`, `buildSimulatedTraRegistrationResponse()`, `buildSimulatedTraReceiptResponse()`, and `buildSimulatedTraZReportResponse()` emit TRA-compatible XML/JSON responses.
- `buildSimulatedEwuraResponse()` emits an EWURA NPGIS response envelope.
- `createTanzaniaFiscalSimulatorFetch()` returns a `fetch`-compatible transport that responds to the package-compatible TRA and EWURA endpoints.

Use simulator fetch injection in tests and field rehearsals only. Production Tanzania fiscal routes should continue to use real configured endpoints unless a station is explicitly placed into a developer/simulator mode.

## Scope boundary

The output renderer replaces the printable content semantics from the reference package, not the hardware drivers. Physical printer, PDF receipt, or dashboard preview integration should be implemented as separate adapters that consume the rendered text output.
