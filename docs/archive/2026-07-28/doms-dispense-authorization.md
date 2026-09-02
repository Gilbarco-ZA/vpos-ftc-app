# DOMS/JPL dispense authorization model

This note records the application-domain model used to build DOMS/JPL fuelling authorization requests. It separates business intent from raw JPL message names and subcodes while preserving the exact protocol envelope at the transport boundary.

## Supported authorization operations

| Domain operation | JPL request         | Subcode | Purpose                                                                                 |
| ---------------- | ------------------- | ------: | --------------------------------------------------------------------------------------- |
| `standard`       | `authorize_Fp_req`  |   `00H` | Authorize using the fuelling point's active service mode.                               |
| `preset`         | `authorize_Fp_req`  |   `01H` | Authorize with a volume, money, floor, or void preset.                                  |
| `extended`       | `authorize_Fp_req`  |   `02H` | Authorize with service-mode, grade, start-limit, price, log, or return-data parameters. |
| `prepay`         | `prepare_Trans_req` |   `01H` | Lock and prepare a transaction before a later authorization starts fuelling.            |

Implementation: [`dispenseAuthorization.ts`](../src/modules/forecourt/infrastructure/jpl/dispenseAuthorization.ts)

The generic command dispatcher resolves legacy action names into one of these operations before constructing the transport envelope. Nested `AuthorizePars` objects are normalized rather than passed through unvalidated.

## Service-mode abstraction

The first digit of the two-digit DOMS service-mode ID is exposed as a typed family:

| ID family | Domain family           |
| --------- | ----------------------- |
| `1x`      | `postpay_pos`           |
| `2x`      | `prepay_pos`            |
| `3x`      | `attendant_postpay`     |
| `4x`      | `calibration`           |
| `5x`      | `card_preauthorization` |
| `6x`      | `banknote_prepay`       |
| other     | `unknown`               |

The normalized service-mode object also carries the fuelling-mode-group ID, price-group ID, and a deduplicated list of valid grade IDs. Callers can therefore work with domain names and typed identifiers instead of protocol prefixes and field casing.

## Numeric and identifier normalization

Authorization builders normalize protocol values before transport:

- `FpId`, `PosId`, `SmId`, `FmgId`, `PgId`, `AutoLockId`, and valid-grade IDs use two-digit ID forms.
- `DEC4`, `DEC6`, and `DEC10` values reject signs, decimal separators, missing values, and over-width input.
- Preset limits are emitted as six-digit values.
- Extended `_e` start limits are emitted as ten-digit values.
- `CODE1` values are emitted in canonical uppercase hexadecimal form ending in `H`.

Shared helpers: [`protocol/types.ts`](../src/modules/forecourt/infrastructure/jpl/protocol/types.ts)

## Valid-grade restrictions

The builder supports one or more `ValidGrades` and normalizes each grade to an `ID2`. Whether grade locking is enabled for a site remains a commissioning decision. Pump protocols that do not report grade/nozzle information in the calling state cannot reliably use call-state grade locking, so activation must remain field-gated.

## Validation status

Automated coverage is provided by:

- [`domsDispenseAuthorization.test.ts`](../tests/forecourt/domsDispenseAuthorization.test.ts)
- [`domsJplNumericTypes.test.ts`](../tests/forecourt/domsJplNumericTypes.test.ts)
- [`domsOptionalCommandBuilders.test.ts`](../tests/forecourt/domsOptionalCommandBuilders.test.ts)
- [`domsResponseParsers.test.ts`](../tests/forecourt/domsResponseParsers.test.ts)

The following remain intentionally open:

- confirmation of preset and start-limit scaling against live pump/service-mode configuration;
- live verification of valid-grade behavior for each target pump protocol;
- clean production build and complete test execution with the private Gilbarco package feed available;
- simulator and real-controller acceptance evidence.
