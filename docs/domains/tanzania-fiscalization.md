# Tanzania Fiscalization

**Type:** authoritative

Tanzania-specific behavior covers country routing, invoice fiscalization, daily totals, TRA/EWURA catalogs, secure artifacts, output simulation, parity validation, and cloud cutover.

## Country boundary

The Tanzania contract is active only when the canonical station country resolves to `TZ`/Tanzania. Other countries continue through their existing fiscalization contracts.

`vpos-ftc-app` posts fiscal invoices to the stable local proxy route `POST /api/invoices`. For a Tanzania station it adds persisted Tanzania metadata to the generic invoice, including the invoice number, receipt verification number, Z-number, daily counter, global counter, invoice date, customer identity, issuer, exchange rate, and payment split.

`vpos-proxy` owns the final country-specific transport mapping. When its registered country is `TZ`, it converts the local invoice to the supplied Tanzania request and sends it to `POST /api/tanzania/invoices`. A direct Tanzania endpoint is rejected by the proxy when its registered country is not `TZ`. FTC does not send `deviceId`, `x-device-id`, or `EWURA_LC` as part of Tanzania invoice, daily-total, or tank-inventory submissions; those identity and licence values are resolved by the cloud service.

The invoice number and daily counter remain tied to the originating
transaction date. Tanzania invoices force the generic proxy currency to `TZS`
so the proxy emits `currencyCode: "TZS"` in the Tanzania cloud contract, while
`zNumber` and `invoiceDate` are allocated from the
fiscalization attempt that first creates the persisted Tanzania assignment.
FTC sends `invoiceDate` in the station timezone as an ISO-8601 timestamp with
an explicit numeric UTC offset (for example `+03:00` for
`Africa/Dar_es_Salaam`). Retries reuse the persisted assignment and therefore
reuse the same invoice date, counters, and receipt identity. The proxy then
builds the final `invoice` / `items` / `payments` Tanzania cloud request.

Invoice tax codes are validated against the vpos-proxy Tanzania contract before invoice identity or counters are allocated. Codes `A` through `E` are supported; `Z` is rejected and is not offered by the Tanzania catalog. Invoice identity and counters are then allocated once and persisted in `tanzania_proxy_invoice_assignments`. Retries therefore reuse the same fiscal identity instead of consuming a new counter or creating a second authority document.

## TRA and EWURA registration

When `/setup` is configured for Tanzania, TRA and EWURA registration are
presented and submitted as separate operations. FTC sends TRA registration to
`POST /api/tanzania/registrations/tra` and EWURA registration to
`POST /api/tanzania/registrations/ewura` on the configured `vpos-proxy` base
URL.

The TRA request contract is exactly `tin`, `serialNumber`, `certSerial`,
`privateKeyBase64`, `publicKeyBase64`, `password`, and `licenseKey`. The setup
page captures those seven values directly and submits that exact JSON object to
`vpos-proxy`. The certificate serial is the Base64 value expected by the cloud
registration contract, the private key is PKCS#8 DER Base64, and the public key
is SPKI DER Base64. Registration responses are successful only when the HTTP
request succeeds and the Tanzania response does not set `error: true`; the
OpenAPI registration response can report a business rejection in an HTTP 200
response. The certificate serial, private key, public key, TRA
password, and licence key are not persisted in setup station-KV storage. The
older PKCS#12 (`.pfx`/`.p12`) import path remains a server-side compatibility
fallback for legacy callers, but it is no longer the primary setup UX.

The EWURA request contract is exactly `retailStationName`, `ewuraLicenseNo`,
`regionName`, `districtName`, `wardName`, `zone`,
`contactPersonEmailAddress`, and `contactPersonPhone`. Non-sensitive setup
values and redacted registration results may be retained locally for setup
continuity and diagnostics. A proxy/cloud registration rejection is surfaced to
the setup/admin client with its sanitized upstream status and message rather
than being collapsed into a generic FTC internal-server-error response.

## ATG tank inventories

For Tanzania stations, each successful automatic ATG polling cycle publishes the complete current tank snapshot set to the local `vpos-proxy` route `POST /api/tanzania/tank-inventories` after the local database refresh commits. The `/tanks` **Refresh Tank Gauge Data** action also publishes the exact snapshot set produced by that manual refresh immediately after the local sync succeeds. Other station countries do not call this endpoint.

The request sends one item per tank with the proxy contract fields `product_name`, `tank_name`, `capacity`, `Temperature`, `TC_Volume`, `Volume`, and `Tank_ID`. Before publication, DOMS fixed-point tank readings are normalized to physical values using the JPL data-type resolutions, so `FC_TANK_VOL` values are divided by 100 and temperature values by 10. A positive FTC-configured tank capacity is used first; if it is absent or zero, the latest snapshot falls back to DOMS `TankShellCapacity`, then `TankMaxSafeFillCapacity`. Temperature and the two volume values are serialized as decimal strings without discarding available ATG precision; whole-number readings receive a `.0` suffix, and non-negative temperatures include the leading `+` expected by the Tanzania contract. DOMS two-digit tank IDs are normalized to their numeric string form for the proxy payload.

Only rows written by the same ATG capture timestamp are eligible for a submission. The uploader compares that set with the tank gauges requested during `GET_ALL_TG_DATA` and rejects a partial capture instead of mixing fresh and stale tank values. A proxy rejection/failure marks the ATG worker heartbeat as degraded; the local ATG snapshot remains committed and the next configured polling cycle collects and submits a fresh current snapshot. `tank_atg_snapshots` still keeps only the latest current-state row per tank. A separate normalized `tank_atg_capture_evidence` window is retained locally for 30 days solely for transaction-time regulatory projection; the proxy/cloud service owns long-term ATG history.

## Transaction tank projection

For a Tanzania fuel sale, FTC reports one regulatory tank even when the dispensing tank belongs to a same-grade tank group. The physical source tank is first resolved from the transaction's persisted `tank_id`, exact `nozzle_id`, or exact pump/nozzle mapping; product-name or first-nozzle guessing is not used by the regulatory projection.

If the source tank has a `tank_group_id`, FTC sums the observed `volume_litres` from the latest complete ATG capture for all `ACTIVE` tanks in that group with the same `product_id`. The configured active tank for the grade must be a member of that group and becomes the single representative regulatory `Tank_ID`. If the source tank is ungrouped, FTC uses the configured active tank for that grade as both the baseline tank and the representative `Tank_ID`; that active tank must also be ungrouped. The legacy `tanks.config.activeTanks` assignment is therefore a required Tanzania configuration input.

The projected post-sale balance is calculated in litres as `ATG baseline - prior same-scope sales since the ATG capture - current transaction volume`. The transaction monetary amount is never used as an inventory deduction. Group members must have readings from the same complete ATG capture timestamp. FTC selects the newest complete evidence capture at or before the transaction; a later poll therefore cannot overwrite the pre-sale evidence needed by a delayed fiscal sender. If an older transaction projection already persisted the identical product, group/member set, and representative tank, its immutable ATG baseline may be reused and all intervening sales are recalculated. This provides safe retry continuity without deriving a pre-sale value from a newer physical reading. Missing active-tank configuration, incomplete pre-sale evidence, ambiguous mapping, or a negative projected balance blocks Tanzania fiscalization rather than guessing.

FTC persists the result in `tanzania_transaction_tank_projections` when the transaction is captured. The ATG baseline, group/member identities, representative tank, and transaction volume remain fixed. Immediately before invoice fiscalization FTC recalculates the cumulative prior-sale deduction against that persisted baseline so concurrent/delayed transaction capture is reflected without switching to a newer ATG reading. The Tanzania invoice then overrides `lines[].product.fuel.tankId` with the representative DOMS/regulatory tank ID and adds `lines[].product.fuel.tankVolume` as the projected post-sale volume in litres. Non-Tanzania invoices are unchanged.

The transaction projection does not modify `tank_atg_snapshots` or `tanks.live_volume_litres`; the next successful ATG capture remains the authoritative physical measurement and naturally establishes the baseline for subsequent transactions.

## Daily totals

The `tanzaniaDailyTotalsWorker` runs only for Tanzania stations. It compiles the previous closed station business day, persists the exact request in `tanzania_daily_total_submissions`, and submits it to the local proxy at `POST /api/tanzania/daily-totals`. The proxy validates and forwards that payload to the same cloud path. Offline submissions are owned by the proxy queue and are not independently resent by the app.

The normal automatic cadence is one report per closed business day. `station_settings.tanzania_daily_totals_send_time` stores the station-local wall-clock send time in `HH:mm` form and defaults to `00:00` (midnight). The worker may wake more frequently, but it does not create the previous closed day's submission until the configured local send time has been reached. `VPOS_TANZANIA_DAILY_TOTALS_POLL_MS` (default `60000`) remains the worker polling interval rather than the fiscal reporting schedule. Schedule changes are read on subsequent worker ticks and do not require a process restart. A stale `SENDING` row is reclaimable after ten minutes, and the date-scoped idempotency key prevents duplicate submission during recovery.

Managers and administrators can review recorded Tanzania daily totals at `/tanzania/daily-totals`; the navigation entry and page are unavailable for non-Tanzania stations. The page reads the persisted submission outbox as the history source, exposes the recorded request, status, proxy request ID, retry/error information, and a printable daily-report view. Administrators can temporarily force-send any closed business date that is not already `SENDING` or `QUEUED`; the request is rebuilt from current authoritative station data and uses the same date-scoped idempotency key. Administrators can also edit the daily send time from this page. Both schedule changes and manual force-send actions are audit logged. The force-send control is a commissioning/recovery aid and is intentionally isolated so it can be removed without changing automatic scheduling.

Current aggregation follows the pre-existing Tanzania Z-report semantics:

- `dailyTotalAmount` is the sum for the business date;
- `grossTotal` is the administrator-configured opening cumulative gross total plus fiscal turnover recorded by this installation through the business date;
- payment totals use `CASH`, `CCARD`, `CHEQUE`, `INVOICE`, and `EMONEY` normalization;
- tax net and tax amounts are grouped into authority buckets `A` through `E`;
- fuel totals classify petrol, diesel, and kerosene from the captured grade/product descriptors;
- tickets, discounts, and void values are zero where the current transaction model has no authoritative source;
- `tanks` contains every `ACTIVE` physical tank separately; tank groups are not aggregated in the daily report. Each row uses the latest complete ATG `volume_litres` as `measuredEndVolume`, the station tank's normalized DOMS ID as `tankId`, and the business-date tank inventory ledger for `saleNumber`, `saleVolume`, and delivery volume. `startVolume` is reconstructed as `measuredEndVolume + saleVolume - atgDeliveryVolume`, `calculatedEndVolume` applies the same daily movements back to that opening value, and `volumeDifference` compares the calculated and measured end values. All tanks must come from the same complete ATG capture or the report is blocked for a gauge refresh.

Administrators configure the opening value, receipt counter baselines, receipt verification prefix, and the legacy optional Tanzania device ID override on `/admin/tanzania-fiscal`. The receipt prefix can use the built-in Development (`F1D845`) or Production (`4BC37A`) value, or a validated six-character manual override stored in `station_settings`. Existing installations default to Development to preserve prior behaviour. A prefix change affects only newly allocated verification numbers; persisted transaction assignments retain their original number on retries. The Device ID override remains stored locally for compatibility, but it is not included in invoice, daily-total, or tank-inventory submissions because cloud-side configuration now owns the effective device identity. For a
new station an administrator must explicitly save `0.00` to confirm that the
lifetime total starts with this installation. When replacing faulty fiscal
hardware at an existing station, it must be set to the last accepted lifetime
`grossTotal` from the retired machine before the first transaction recorded by
the new installation. The daily and global counter fields represent the last
accepted counter values, so the next invoice increments each value before use.
The daily counter is stored for the station's current local business date; a new
business date starts from its own daily counter row. Counter changes and the
gross-total value are saved atomically and audit logged. Previously
persisted daily-total
outbox payloads already marked `QUEUED` or `SENT` are not rewritten. A
`PENDING` or `FAILED` row can be refreshed by the worker before its next
submission attempt.

Tanzania proxy buyer identity is derived from the customer data attached to the
transaction, not from the station registration's default customer type. FTC
currently captures TIN as its supported Tanzania customer authority identity:
a non-empty customer TIN produces `custIdType: "1"` and the same mandatory TIN
in `custId`. A customer without a captured TIN produces NIL
(`custIdType: "6"`) and an empty `custId`. The receipt uses the same rule, so it
cannot print a linked TIN as customer ID type 6. The remaining authority types
(driving licence, voter number, passport, NID, and meter number) are reserved
until their corresponding identifiers are explicitly captured.

Proxy receipt rendering uses `details.receipt` from the successful invoice
response as its authoritative fiscal receipt. FTC accepts both the camel-case
field names documented by the proxy OpenAPI schema and the Pascal-case names
returned by existing deployments. The persisted request's
`tanzania.rctVerificationNum`, counters, and invoice date are compatibility
fallbacks only when an older proxy response omits receipt details. It must not
substitute the invoice number for the receipt verification number. A successful
retry regenerates a receipt whose stored response metadata predates
fiscalization or differs from the successful result, while retaining the
earlier receipt row as historical evidence. When the proxy omits `documentId`,
FTC persists the exact `documentId` submitted in the successful request and
never substitutes `documentNumber`.

`details.receipt.fiscalQrCodeData` is the complete, authoritative QR payload.
FTC stores and prints that value verbatim; it does not infer or rewrite its
domain from the verification-code prefix. This matters when, for example, the
proxy returns an `F1D845` verification code with a `verify.tra.go.tz` URL. The
prefix setting controls new outgoing `rctVerificationNum` allocation only. For
legacy responses that omit `fiscalQrCodeData`, FTC still constructs a fallback
URL: Development uses `virtual.tra.go.tz/efdmsRctVerify`, while Production and
Manual use `verify.tra.go.tz`. Physical receipt jobs convert the canonical
snapshot's `[QR]` marker into a native ESC/POS QR command instead of printing or
truncating the serialized value.

The physical Tanzania receipt uses the same legal framing and identity layout
as the browser preview. The TRA start/end legal-receipt PNGs are converted to
monochrome ESC/POS raster images and centered above and below the receipt. The
configured station display name is centered and bold, the station TIN is always
included when available, and customer identity plus receipt number, Z-number,
date, and time use left-label/right-value columns. A configured PNG brand logo
is also centered beneath the legal-receipt start image; JPEG and SVG logos
remain preview-only. If either fixed TRA image cannot be loaded, printing
continues with a centered text equivalent instead of failing the entire job.

When `station_settings.auto_print_receipts` is enabled, both an immediately
final proxy response and a later reconciled proxy result create the canonical
receipt snapshot and enqueue one reference-based `print.receipt` job. The
station-and-transaction idempotency key is shared with local fiscalization so
retries and reconciliation cannot create duplicate automatic print jobs.

## Contract points requiring authority confirmation

The supplied OpenAPI schema defines field names and types but not all business formulas. Before production sign-off, confirm:

1. the exact source and treatment of discounts, voids, non-fiscal tickets, and credited transactions;
2. the required `reportTime` convention;
3. acceptance of the transaction fuel fields `tankId` (single representative DOMS tank) and `tankVolume` (post-sale grouped/active-tank projected litres);
4. whether the daily tank opening-volume reconstruction and use of the latest complete ATG capture meet the authority's closing-report convention.

Tax code `Z` is not supported by vpos-proxy. No interim invoice or
daily-total bucket mapping is assumed. Invoice enrichment rejects `Z` before
receipt counters are allocated, and daily-total compilation also fails
explicitly if historical data contains `Z` or another unsupported bucket.

## Operational requirements

Runtime catalog authority is stored in the canonical country dataset tables. Bundled datasets seed or reset canonical data but are not updated by administrator edits.

Changes require:

- payload and response contract tests;
- secure handling of certificates, credentials, and signed artifacts;
- parity evidence against the approved integration behavior;
- explicit rollback and cutover criteria;
- confirmation that offline and retry behavior preserves document identity.

See the [Tanzania cutover](../runbooks/tanzania-cutover.md) and [secure artifacts](../runbooks/secure-artifacts.md) runbooks.
